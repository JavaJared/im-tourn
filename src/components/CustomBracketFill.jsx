import BracketLoader from './BracketLoader';
import PostBracketButton from '../pages/feed/PostBracketButton';
import BracketPickViews from './BracketPickViews';
import { callServer } from '../services/server';
import { BracketFrame as Shell, bracketFrameStyles as S } from './BracketFrame';
import SaveNotice from './SaveNotice';
import DownloadBracketImage from './DownloadBracketImage';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Send } from './customBracketIcons';
import { SLOT, setResult, getChampion } from '../lib/customBracket';
import BracketBoard from './BracketBoard';
import { isEntryComplete, picksFromState, blankPrediction, applyPicks } from '../lib/customScoring';
import { subscribeToBracket, submitCustomFill, getCustomFill } from '../services/customBracketService';

function nameMapOf(state) { const m = {}; for (const id of Object.keys(state.boxes)) for (const k of ['slotA', 'slotB']) { const s = state.boxes[id][k]; if (s.type === SLOT.NAMED) m[s.participantId] = s.name; } return m; }

/* ====================================================================== *
 * CustomBracketFill — fill out a published custom bracket for fun.
 *   props: bracketId, currentUserId, currentUserName, onExit
 * Mirrors the default-bracket fill flow: pick winners through the bracket and
 * (when signed in) save it as a submission. No scoring, no competition — that
 * lives on pools.
 * ==================================================================== */
export default function CustomBracketFill({ bracketId, currentUserId, currentUserName, onExit, openSaved = false, watchBracket = subscribeToBracket }) {
  const [bracket, setBracket] = useState(null);
  const [status, setStatus] = useState(null);
  const [pred, setPred] = useState(null);      // local prediction engine state
  const [saved, setSaved] = useState(false);
  const [view,setView]=useState('mine');
  const [title, setTitle] = useState('My bracket');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false), draftRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [draftSave, setDraftSave] = useState({ state: 'idle', message: '' });
  const [toast, setToast] = useState(null);
  const [retry, setRetry] = useState(0);

  const predRef = useRef(pred); predRef.current = pred;
  const lsKey = `cbp:pred:${bracketId}:${currentUserId || 'anon'}`;
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    setLoading(true); setError(null); setPred(null); setSaved(false); setView('mine');
    if (!bracketId) { setError('No bracket specified.'); setLoading(false); return undefined; }
    let initialized = false, active = true;
    // Begin independent saved-pick work immediately; consume errors in the handler.
    const ownRequest = (openSaved && currentUserId
      ? getCustomFill(bracketId,currentUserId).then(saved => ({found:!!saved,picks:saved?.picks}))
      : !openSaved && currentUserId ? callServer('getBracketPickView',{type:'custom',bracketId,mode:'mine'}) : Promise.resolve({found:false}))
      .then(value => ({value}), error => ({error}));
    const unsub = watchBracket(bracketId, async (state, meta) => {
      if (!active) return;
      if (!meta.exists || !state) { setError('This bracket could not be found.'); setLoading(false); return; }
      setBracket(state); setTitle(meta.raw.title || 'My bracket'); setStatus(meta.raw.status);
      if (initialized) return;
      initialized = true;
      try {
        let resume=null;
        if(!openSaved) { try { resume=JSON.parse(localStorage.getItem(lsKey)); } catch { /* Start from account picks. */ } }
        const result = await ownRequest;
        if (result.error) throw result.error;
        const own = result.value;
        if(!active)return;
        if(openSaved&&!own.found)throw new Error('Your saved bracket could not be found.');
        const useDraft=resume&&!openSaved&&(!own.found||!resume.updatedAt||resume.updatedAt>own.savedAt);
        const next=applyPicks(blankPrediction(state),useDraft?(resume.picks||resume):(own.picks||{}));
        setPred(next);predRef.current=next;draftRef.current=next;setSaved(!!own.found&&!useDraft);
        setDraftSave(useDraft?{state:'saved',message:'Unsaved picks restored from this device.'}:{state:'idle',message:''});
        setError(null);
      } catch(reason) { if(active)setError(reason.message||'Your saved picks could not be loaded. Please retry.'); }
      finally { if(active)setLoading(false); }
    }, err => { if(active){setError(err?.message||'Connection error.');setLoading(false);} });
    return ()=>{active=false;unsub();};
  }, [bracketId,currentUserId,lsKey,openSaved,retry,watchBracket]);

  const nameMap = useMemo(() => (pred ? nameMapOf(pred) : {}), [pred]);
  const complete = useMemo(() => (pred ? isEntryComplete(pred) : false), [pred]);
  const canEdit = !openSaved && status === 'published' && view==='mine' && !sending;

  const pick = (boxId, pid) => {
    if (!canEdit || sendingRef.current) return;
    const cur = predRef.current; let next;
    try { next = setResult(cur, boxId, pid); } catch (e) { flash(e.message); return; }
    predRef.current = next; draftRef.current = next; setPred(next); setSaved(false); setSaveError(''); saveDraft(next);
  };

  const saveDraft = (next = draftRef.current) => {
    if (!next) return;
    try { localStorage.setItem(lsKey, JSON.stringify({picks:picksFromState(next),updatedAt:Date.now()})); setDraftSave({ state: 'saved', message: 'Draft saved on this device. Save my bracket saves it to your account.' }); }
    catch { setDraftSave({ state: 'error', message: 'This browser could not save your draft. Keep this page open; your picks are still here.' }); }
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
    try { localStorage.removeItem(lsKey); } catch { /* Account save succeeded; keep the visible save state. */ }
    setDraftSave({state:'idle',message:''});
  };

  if (loading) return <Shell onExit={onExit}><BracketLoader label="Loading bracket…"/></Shell>;
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
          {currentUserId && saved && complete && view==='mine' && <PostBracketButton key={JSON.stringify(picksFromState(pred))} type="custom" bracketId={bracketId}/>}
          {view==='mine' && <DownloadBracketImage title={title} getState={()=>pred}/>}
          {!openSaved && view==='mine' && <DownloadBracketImage title={`${title} - blank`} label="Save blank PNG" getState={()=>blankPrediction(bracket)}/>}
          {!openSaved && view==='mine' && <button style={{ ...S.primary, ...(complete ? {} : S.primaryOff) }} disabled={!complete || !canEdit} onClick={save}>
            {saved ? <><Check size={14} strokeWidth={3} /> Saved</> : <><Send size={14} strokeWidth={2.5} /> {sending ? 'Saving…' : saveError ? 'Retry save' : 'Save my bracket'}</>}
          </button>}
        </div>
      </header>

      {!openSaved && view==='mine' && <>
        <SaveNotice {...draftSave} onRetry={() => saveDraft()} retryLabel="Retry draft save" />
        <SaveNotice state={saveError ? 'error' : sending ? 'saving' : 'saved'} message={saveError || (sending ? 'Saving your bracket. Please keep this page open.' : saved ? 'Bracket saved to your account.' : '')} onRetry={currentUserId && !sending ? save : undefined} />
      </>}
      {view==='mine' && !complete && <div style={S.notice}>{openSaved ? 'Some saved picks are missing or no longer match this bracket.' : 'Pick a winner in every matchup to complete your bracket. Sign in to save it.'}</div>}

      <div style={S.scroll}>
        {openSaved ? <BracketBoard state={pred} nameMap={nameMap} editable={false} /> :
          <BracketPickViews type="custom" bracketId={bracketId} userId={currentUserId} view={view} onView={setView} disabled={sending}>
            <BracketBoard state={pred} nameMap={nameMap} editable={canEdit} onPick={pick} />
          </BracketPickViews>}
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}
