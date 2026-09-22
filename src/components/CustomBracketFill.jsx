import { BracketFrame as Shell, bracketFrameStyles as S } from './BracketFrame';
import UsernameText from './layout/UsernameText';
import SaveNotice from './SaveNotice';
import { exportBracketPdf } from '../lib/exportBracketPdf';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Send } from './customBracketIcons';
import { SLOT, setResult, getChampion } from '../lib/customBracket';
import BracketBoard from './BracketBoard';
import { isEntryComplete, picksFromState, blankPrediction, applyPicks } from '../lib/customScoring';
import { subscribeToBracket, submitCustomFill, getCustomFills, getCustomFill } from '../services/customBracketService';

function nameMapOf(state) { const m = {}; for (const id of Object.keys(state.boxes)) for (const k of ['slotA', 'slotB']) { const s = state.boxes[id][k]; if (s.type === SLOT.NAMED) m[s.participantId] = s.name; } return m; }

/* ====================================================================== *
 * CustomBracketFill — fill out a published custom bracket for fun.
 *   props: bracketId, currentUserId, currentUserName, onExit
 * Mirrors the default-bracket fill flow: pick winners through the bracket and
 * (when signed in) save it as a submission. No scoring, no competition — that
 * lives on pools.
 * ==================================================================== */
export default function CustomBracketFill({ bracketId, currentUserId, currentUserName, onExit, openSaved = false }) {
  const [bracket, setBracket] = useState(null);
  const [status, setStatus] = useState(null);
  const [pred, setPred] = useState(null);      // local prediction engine state
  const [saved, setSaved] = useState(false);
  const [fills, setFills] = useState([]);
  const [viewing, setViewing] = useState('');
  const [title, setTitle] = useState('My bracket');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false), draftRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [draftSave, setDraftSave] = useState({ state: 'idle', message: '' });
  const [fillsError, setFillsError] = useState('');
  const [toast, setToast] = useState(null);
  const [retry, setRetry] = useState(0);

  const predRef = useRef(pred); predRef.current = pred;
  const lsKey = `cbp:pred:${bracketId}:${currentUserId || 'anon'}`;
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    setLoading(true); setError(null); setPred(null); setFills([]);
    setSaved(false); setViewing('');
    if (!bracketId) { setError('No bracket specified.'); setLoading(false); return undefined; }
    let initialized = false, active = true;
    const unsub = subscribeToBracket(bracketId, async (state, meta) => {
      if (!active) return;
      if (!meta.exists || !state) { setError('This bracket could not be found.'); setLoading(false); return; }
      setBracket(state); setTitle(meta.raw.title || 'My bracket'); setStatus(meta.raw.status);
      if (initialized) return; // seed local fill state once
      initialized = true;
      setError(null);
      let resume = null;
      if (!openSaved) {
        try { const raw = localStorage.getItem(lsKey); resume = raw ? JSON.parse(raw) : null; } catch { resume = null; }
        const initial = applyPicks(blankPrediction(state), resume || {}); draftRef.current = initial; setPred(initial);
        setLoading(false);
      }
      setSaved(false); setViewing('');
      try {
        const own = openSaved ? await getCustomFill(bracketId, currentUserId) : null;
        const all = openSaved ? (own ? [own] : []) : await getCustomFills(bracketId);
        if (!active) return;
        setFills(all);
        const mine = all.filter(f => f.userId === currentUserId).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
        if ((!resume || openSaved) && mine) { const mineState = applyPicks(blankPrediction(state), mine.picks); setPred(mineState); draftRef.current = mineState; setSaved(true); if (openSaved) setViewing(mine.id); }
        if (openSaved && !mine) setError('Your saved bracket could not be found.');
      } catch (e) {
        if (!active) return;
        if (openSaved) setError('Your saved bracket could not be loaded. Please retry.');
        else flash('Saved brackets could not be loaded. Try reopening this bracket.');
      } finally { if (active) setLoading(false); }
    }, (err) => { if (active) { setError(err?.message || 'Connection error.'); setLoading(false); } });
    return () => { active = false; unsub(); };
  }, [bracketId, currentUserId, lsKey, openSaved, retry]);

  const nameMap = useMemo(() => (pred ? nameMapOf(pred) : {}), [pred]);
  const complete = useMemo(() => (pred ? isEntryComplete(pred) : false), [pred]);
  const canEdit = !openSaved && status === 'published' && !viewing && !sending;

  const pick = (boxId, pid) => {
    if (!canEdit || sendingRef.current) return;
    const cur = predRef.current; let next;
    try { next = setResult(cur, boxId, pid); } catch (e) { flash(e.message); return; }
    predRef.current = next; draftRef.current = next; setPred(next); setSaved(false); setSaveError(''); saveDraft(next);
  };

  const saveDraft = (next = draftRef.current) => {
    if (!next) return;
    try { localStorage.setItem(lsKey, JSON.stringify(picksFromState(next))); setDraftSave({ state: 'saved', message: 'Draft saved on this device. Save my bracket saves it to your account.' }); }
    catch { setDraftSave({ state: 'error', message: 'This browser could not save your draft. Keep this page open; your picks are still here.' }); }
  };
  const refreshFills = async () => {
    try { setFills(await getCustomFills(bracketId)); setFillsError(''); }
    catch { setFillsError('The saved-bracket list could not be refreshed. Your successful save is unaffected.'); }
  };
  const save = async () => {
    if (!canEdit || sendingRef.current) return;
    const cur = predRef.current;
    if (!cur || !isEntryComplete(cur)) return;
    if (!currentUserId) { setSaveError('Sign in to save your bracket to your account. Your picks are still here.'); return; }
    sendingRef.current = true; setSending(true); setSaveError('');
    try { await submitCustomFill(bracketId, { userId: currentUserId, displayName: currentUserName || 'Anonymous', picks: picksFromState(cur), champion: getChampion(cur) }); }
    catch (e) { setSaveError(`Your bracket was not saved. Your picks are still here. ${e?.message || 'Please retry.'}`); sendingRef.current = false; setSending(false); return; }
    setSaved(true); sendingRef.current = false; setSending(false);
    await refreshFills();
  };

  if (loading) return <Shell onExit={onExit}><div style={S.center} role="status"><Loader2 size={20} className="spin" /> Loading…</div></Shell>;
  if (error) return <Shell onExit={onExit}><div style={S.center}><p role="alert"><AlertTriangle size={20} /> {error}</p><button style={S.ghost} onClick={() => setRetry(value => value + 1)}>Retry</button></div></Shell>;
  if (!pred) return null;
  if (status !== 'published' && !(openSaved && ['locked', 'complete'].includes(status))) {
    return <Shell onExit={onExit}><div style={S.center}><Clock size={20} /> This bracket isn't open for filling out.</div></Shell>;
  }

  return (
    <Shell onExit={onExit}>
      <header style={S.top}>
        <div style={S.brand}>
          <span style={S.title}>{title}</span>
          {openSaved && <span style={S.sub}>Read only</span>}
        </div>
        <div style={S.topRight}>
          <button style={S.ghost} onClick={() => exportBracketPdf(pred, nameMap, title).catch(e => flash(e.message))}>Download PDF</button>
          {!openSaved && fills.length > 0 && <select disabled={sending} aria-label="View a saved bracket" value={viewing} onChange={e => {
            const value = e.target.value; setViewing(value);
            if (value) setPred(applyPicks(blankPrediction(bracket), fills.find(f => f.id === value)?.picks || {}));
            else { setPred(draftRef.current || blankPrediction(bracket)); setSaved(false); }
          }}><option value="">My current picks</option>{fills.map(f => <option key={f.id} value={f.id}><UsernameText userId={f.userId} /> — saved</option>)}</select>}

          {!openSaved && <button style={{ ...S.primary, ...(complete ? {} : S.primaryOff) }} disabled={!complete || !canEdit} onClick={save}>
            {saved ? <><Check size={14} strokeWidth={3} /> Saved</> : <><Send size={14} strokeWidth={2.5} /> {sending ? 'Saving…' : saveError ? 'Retry save' : 'Save my bracket'}</>}
          </button>}
        </div>
      </header>

      {!openSaved && !viewing && <>
        <SaveNotice {...draftSave} onRetry={() => saveDraft()} retryLabel="Retry draft save" />
        <SaveNotice state={saveError ? 'error' : sending ? 'saving' : 'saved'} message={saveError || (sending ? 'Saving your bracket. Please keep this page open.' : saved ? 'Bracket saved to your account.' : '')} onRetry={currentUserId && !sending ? save : undefined} />
      </>}
      <SaveNotice state="error" message={fillsError} onRetry={refreshFills} retryLabel="Retry saved list" />
      {!complete && <div style={S.notice}>{openSaved ? 'Some saved picks are missing or no longer match this bracket.' : 'Pick a winner in every matchup to complete your bracket. Sign in to save it.'}</div>}

      <div style={S.scroll}>
        <BracketBoard state={pred} nameMap={nameMap} editable={canEdit} onPick={pick} />
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}
