import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { callServer } from './server';

export const TIMER_OPTIONS = [
  { value: 0, label: 'No limit' }, { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' }, { value: 90, label: '90 seconds' },
  { value: 120, label: '2 minutes' },
];
export const MAX_PARTICIPANTS = 16;
export const MAX_ROUNDS = 20;
const invitations = new Map();
function remember(id, code) {
  invitations.set(id, code);
  try { sessionStorage.setItem(`draft-invite:${id}`, code); } catch { /* Memory still works. */ }
}
function recalled(id) {
  try { return invitations.get(id) || sessionStorage.getItem(`draft-invite:${id}`); } catch { return invitations.get(id); }
}
const action = (draftId, name, data = {}) => callServer('draftAction', { draftId, action: name, ...data });
function parseDraftDoc(data) {
  const array = key => {
    const value = typeof data[key] === 'string' ? JSON.parse(data[key]) : data[key];
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.userId !== 'string')) throw Error('This draft contains damaged records. Please contact its host.');
    return value.map(item => ({ ...item, displayName: typeof item.displayName === 'string' ? item.displayName : 'Anonymous', userDisplayName: typeof item.userDisplayName === 'string' ? item.userDisplayName : 'Anonymous', selection: typeof item.selection === 'string' ? item.selection : null }));
  };
  const scores = typeof data.scores === 'string' ? JSON.parse(data.scores) : data.scores;
  const { joinCode, ...publicData } = data;
  return { ...publicData, title: typeof data.title === 'string' ? data.title : 'Untitled draft', description: typeof data.description === 'string' ? data.description : '', hostDisplayName: typeof data.hostDisplayName === 'string' ? data.hostDisplayName : 'Anonymous', participants: array('participants'), draftOrder: array('draftOrder'), picks: array('picks'), scores: scores && typeof scores === 'object' && !Array.isArray(scores) ? Object.fromEntries(Object.entries(scores).filter(([, v]) => Number.isFinite(v))) : null, createdAt: data.createdAt?.toDate?.() || null, currentPickDeadline: data.currentPickDeadline?.toDate?.() || null };
}
export function subscribeToDraft(draftId, callback, onError) {
  let active = true, version = 0;
  const unsubscribe = onSnapshot(doc(db, 'drafts', draftId), async snap => {
    const current = ++version;
    try {
      let draft = snap.exists() ? { id: snap.id, ...parseDraftDoc(snap.data()) } : null;
      if (draft?.schemaVersion === 2 && draft.hostId === auth.currentUser?.uid) {
        const invite = await action(draftId, 'invite'); draft.joinCode = invite.joinCode;
      }
      if (active && current === version) callback(draft);
    } catch (error) { if (active && current === version) onError?.(error); }
  }, onError);
  return () => { active = false; unsubscribe(); };
}
export async function getDraftById(id) {
  const snap = await getDoc(doc(db, 'drafts', id));
  return snap.exists() ? { id: snap.id, ...parseDraftDoc(snap.data()) } : null;
}
export async function createDraft(data) {
  const result = await callServer('draftAction', { action: 'create', title: data.title, description: data.description || '', category: data.category || '', rounds: data.rounds, timerSeconds: data.timerSeconds || 0 });
  remember(result.id, result.joinCode); return result;
}
export async function getDraftByJoinCode(joinCode) {
  const result = await callServer('resolveDraftInvite', { joinCode });
  if (result.id) remember(result.id, joinCode.trim().toUpperCase());
  return result.id ? result : null;
}
export const joinDraft = (id, _uid, _name, joinCode) => action(id, 'join', { joinCode: joinCode || recalled(id) || '' });
export const leaveDraft = id => action(id, 'leave');
export const kickParticipant = (id, _host, targetUserId) => action(id, 'kick', { targetUserId });
export const startDraft = id => action(id, 'start');
export const submitPick = (id, _uid, selection, expectedPickIndex) => action(id, 'pick', { selection, expectedPickIndex });
export const skipPick = (id, expectedPickIndex) => action(id, 'skip', { expectedPickIndex });
export const saveScores = (id, _host, scores) => action(id, 'scores', { scores });
export const updateDraftDescription = (id, _host, description) => action(id, 'description', { description });
export const deleteDraft = id => action(id, 'delete');
export const getAllDrafts = async () => (await callServer('browseCatalog', { type: 'draft' })).items;
export const getUserCreatedDrafts = async () => (await callServer('browseCatalog', { type: 'draft', mine: 'hosted' })).items;
export const getUserJoinedDrafts = async () => (await callServer('browseCatalog', { type: 'draft', mine: 'joined' })).items;
export function computeSnakeOrder(participants, rounds) {
  // Sort by the random order assigned at draft start.
  const sorted = [...participants].sort((a, b) => a.order - b.order);
  const order = [];
  for (let round = 1; round <= rounds; round++) {
    const isEvenRound = round % 2 === 0;
    const roundParticipants = isEvenRound ? [...sorted].reverse() : sorted;
    roundParticipants.forEach((p, idx) => {
      order.push({
        round,
        pickInRound: idx + 1,
        userId: p.userId,
        userDisplayName: p.displayName,
      });
    });
  }
  return order;
}

export function computeLeaderboard(draft) {
  if (!draft || !draft.scores || !draft.picks) return [];
  const scores = draft.scores;
  const totals = new Map();

  for (const pick of draft.picks) {
    const score = scores[pick.pickIndex] || 0;
    if (!totals.has(pick.userId)) {
      totals.set(pick.userId, {
        userId: pick.userId,
        displayName: pick.userDisplayName,
        total: 0,
        pickScores: [],
      });
    }
    const entry = totals.get(pick.userId);
    entry.total += score;
    entry.pickScores.push({ ...pick, score });
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}
