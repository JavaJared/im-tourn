import { callServer } from '../server';
import { auth } from '../../firebase';
import { normalizeSleeper } from '../../lib/legacyPoolAdapter';

const memory = new Map();
const key = (type, id) => `im-tourn:invite:${type}:${id}`;
function remember(type, id, code) {
  memory.set(key(type, id), code);
  try { sessionStorage.setItem(key(type, id), code); } catch { /* Storage may be blocked. */ }
}
function recalled(type, id) {
  try { return memory.get(key(type, id)) || sessionStorage.getItem(key(type, id)) || null; }
  catch { return memory.get(key(type, id)) || null; }
}
export function parsePoolField(value, fallback = null) {
  if (value == null) return fallback;
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw new Error('This pool contains damaged data. Please contact its host.'); }
}
export function parseEntry(data) {
  data = { ...data, userDisplayName: typeof data.userDisplayName === 'string' ? data.userDisplayName : 'Anonymous', score: Number.isFinite(data.score) ? data.score : 0 };
  const convert = value => value?.toDate?.() || (value ? new Date(value) : null);
  try {
    return { ...data, predictions: parsePoolField(data.predictions), sleeper1: normalizeSleeper(data.sleeper1), sleeper2: normalizeSleeper(data.sleeper2), joinedAt: convert(data.joinedAt), submittedAt: convert(data.submittedAt) };
  } catch {
    // Keep the participant visible, but never score or display corrupt predictions.
    return { id: data.id, poolId: data.poolId, userId: data.userId, userDisplayName: data.userDisplayName || 'Anonymous', score: 0, predictions: null, dataError: true, submittedAt: convert(data.submittedAt) };
  }
}
export async function createPool(type, pool) {
  const result = await callServer('createPrivatePool', { type, pool: { ...pool, lockDate: pool.lockDate?.toISOString?.() || pool.lockDate || null } });
  remember(type, result.id, result.joinCode);
  return result;
}
export async function resolveInvite(type, joinCode) {
  const normalized = joinCode.trim().toUpperCase();
  const result = await callServer('resolvePoolInvite', { type, joinCode: normalized });
  if (result) remember(type, result.id, normalized);
  return result;
}
export async function hostInvite(type, pool) {
  // Never expose a legacy public code through the new frontend.
  const { joinCode: ignored, ...safe } = pool;
  if (auth.currentUser?.uid !== pool.hostId) return safe;
  const invite = await callServer('getPoolInvite', { type, poolId: pool.id });
  return { ...safe, joinCode: invite.joinCode };
}
export async function joinPool(type, poolId) {
  return callServer('joinPrivatePool', { type, poolId, joinCode: recalled(type, poolId) });
}
export async function ownEntry(type, poolId) {
  if (!auth.currentUser) return null;
  const entry = await callServer('getPrivatePoolEntry', { type, poolId });
  return entry ? parseEntry(entry) : null;
}
export async function poolEntries(type, poolId, cursor = null) {
  if (!auth.currentUser) return Object.assign([], { nextCursor: null, predictionsHidden: true });
  const page = await callServer('readPoolEntries', { type, poolId, cursor });
  return Object.assign(page.entries.map(parseEntry).sort((a, b) => b.score - a.score), { nextCursor: page.nextCursor, predictionsHidden: page.predictionsHidden });
}
export function removePool(type, poolId) { return callServer('deletePrivatePool', { type, poolId }); }

// Bounded refreshes replace the old public listener on every participant's picks.
// More pages are requested only after the user asks to load more participants.
export function watchEntries(type, poolId, onChange, onError, adapt = entry => entry) {
  let stopped = false, pages = 1, pending = null;
  const refresh = () => {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        let page = await poolEntries(type, poolId);
        const all = [...page];
        for (let n = 1; n < pages && page.nextCursor; n++) {
          page = await poolEntries(type, poolId, page.nextCursor);
          all.push(...page);
        }
        const own = await ownEntry(type, poolId);
        if (own && !all.some(entry => entry.id === own.id)) all.push(own);
        const result = Object.assign(all.map(entry => { try { return adapt(entry); } catch { return { ...entry, predictions: null, dataError: true }; } }).sort((a, b) => b.score - a.score), { nextCursor: page.nextCursor, predictionsHidden: page.predictionsHidden });
        if (!stopped) onChange(result);
      } catch (error) { if (!stopped) onError?.(error); }
      finally { pending = null; }
    })();
    return pending;
  };
  const timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) refresh(); }, 15000);
  refresh();
  const stop = () => { stopped = true; clearInterval(timer); };
  stop.refresh = refresh;
  stop.loadMore = async () => { pages++; await pending; return refresh(); };
  return stop;
}
