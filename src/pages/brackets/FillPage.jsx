import DownloadBracketImage from '../../components/DownloadBracketImage';
import { convertLegacyMatchups } from '../../lib/standardBracket';
import { blankPrediction } from '../../lib/customScoring';
import BracketPickViews from '../../components/BracketPickViews';
import { callServer } from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import { useEffect, useRef, useState } from 'react';
import {
  clearFillDraft,
  fillDraftKey,
  readFillDraft,
  saveFillDraft,
  selectFillWinner,
} from '../../lib/fillDraft';
import { useAuth } from '../../contexts/AuthContext';
import LegacyBracketBoard from '../../components/LegacyBracketBoard';
import { BracketFrame, bracketFrameStyles as S } from '../../components/BracketFrame';
import { submitFilledBracket } from '../../services/bracketService';

const FillPage = (props) => {
  const { currentUser } = useAuth();
  const draftKey = fillDraftKey(props.bracket.id, currentUser?.uid);
  // Remount when the account or source changes; never write an old user's draft into a new scope.
  return (
    <FillEditor
      key={JSON.stringify([draftKey, props.bracket.matchups])}
      {...props}
      currentUser={currentUser}
      draftKey={draftKey}
    />
  );
};

const FillEditor = ({ bracket, onSubmit, onBack, currentUser, draftKey }) => {
  const [draft] = useState(() => readFillDraft(draftKey, bracket.matchups));
  const [matchups, setMatchups] = useState(draft.matchups);
  const [view,setView]=useState('mine'),[loadingSaved,setLoadingSaved]=useState(!!currentUser),[loadError,setLoadError]=useState(''),[loadAttempt,setLoadAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    if(!currentUser)return;
    setLoadingSaved(true);setLoadError('');
    callServer('getBracketPickView',{type:'legacy',bracketId:bracket.id,mode:'mine'}).then(result=>{
      if(!active)return;
      if(result.found&&(!draft.restored||(draft.updatedAt!=null&&draft.updatedAt<=result.savedAt))){setMatchups(result.matchups);setDraftStatus('Saved picks loaded.');}
      else if(draft.restored)setDraftStatus('Unsaved picks restored from this device.');
    },error=>{if(active)setLoadError(error.message||'Saved picks could not be loaded.');}).finally(()=>{if(active)setLoadingSaved(false);});
    return ()=>{active=false;};
  },[bracket.id,currentUser?.uid,loadAttempt]);
  const [draftStatus, setDraftStatus] = useState(
    draft.restored ? 'Saved picks restored.' : 'Picks save automatically on this device.',
  );
  const [submitError, setSubmitError] = useState('');
  const [draftFailed, setDraftFailed] = useState(false);
  const persistDraft = next => {
    const saved = saveFillDraft(draftKey, bracket.matchups, next);
    setDraftFailed(!saved);
    setDraftStatus(saved ? 'Picks saved on this device.' : 'Your browser could not save these picks. Keep this page open to avoid losing them.');
  };
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleSelectWinner = (roundIndex, matchIndex, entryNum) => {
    if (submittingRef.current || loadingSaved || loadError || view!=='mine') return;
    const next = selectFillWinner(matchups, roundIndex, matchIndex, entryNum);
    setMatchups(next);
    persistDraft(next);
    setSubmitError('');
  };

  const isComplete = () =>
    matchups.every((round) => round.every((match) => match.winner === 1 || match.winner === 2));

  const getChampion = () => {
    const finalMatch = matchups[matchups.length - 1][0];
    return finalMatch.winner
      ? finalMatch.winner === 1
        ? finalMatch.entry1
        : finalMatch.entry2
      : null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current || loadingSaved || loadError || view!=='mine' || !isComplete()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    const filledBracket = { ...bracket, matchups, champion: getChampion() };
    try {
      if (currentUser) {
        filledBracket.submissionId = await submitFilledBracket(
          { matchups, champion: filledBracket.champion, title: bracket.title || 'Saved bracket', category: bracket.category || 'Other', size: bracket.size || matchups[0].length * 2 },
          bracket.id,
          currentUser.uid,
          currentUser.displayName,
        );
      }
    } catch {
      if (!mounted.current) return;
      setSubmitError(
        'Your bracket could not be submitted. Your picks are still here. Check your connection and try again.',
      );
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    clearFillDraft(draftKey);
    if (mounted.current) onSubmit(filledBracket);
  };

  return (
    <BracketFrame onExit={submitting ? undefined : onBack}>
      <header style={S.top}>
        <div style={S.brand}>
          <h1 style={{ ...S.title, margin: 0 }}>{bracket.title}</h1>
          <span style={S.sub}>Created by <UserLink userId={bracket.userId} /></span>
        </div>
        <div style={S.topRight}>
          <DownloadBracketImage title={`${bracket.title} - blank`} label="Save blank PNG" getState={()=>blankPrediction(convertLegacyMatchups(bracket.matchups,{positionalIds:true}).state)}/>
          {view==='mine' && <button className="legacy-submit" style={{ ...S.primary, ...(!isComplete() || submitting ? S.primaryOff : {}) }}
            disabled={!isComplete() || submitting || loadingSaved || !!loadError} onClick={handleSubmit}>
            {submitting ? 'Saving…' : submitError ? 'Retry save' : currentUser ? 'Save my bracket' : 'Export my bracket'}
          </button>}
        </div>
      </header>
      {view==='mine' && <p style={S.notice} role={draftFailed ? 'alert' : 'status'}>{draftStatus} {draftFailed && <button type="button" style={S.ghost} onClick={() => persistDraft(matchups)}>Retry draft save</button>}</p>}
      {submitError && <p style={S.notice} role="alert">{submitError}</p>}
      {submitting && <p style={S.notice} role="status">Saving your bracket. Please keep this page open.</p>}
      {!currentUser && <p style={S.notice}>Guest picks can be exported. Sign in to save to your account.</p>}
      <div style={S.scroll}>
        <BracketPickViews type="legacy" bracketId={bracket.id} userId={currentUser?.uid} view={view} onView={setView} disabled={submitting}>
          {loadingSaved && <p role="status" style={S.notice}>Loading your saved picks…</p>}
          {loadError && <p role="alert" style={S.notice}>{loadError} <button style={S.ghost} onClick={()=>setLoadAttempt(n=>n+1)}>Retry saved picks</button></p>}
          <LegacyBracketBoard matchups={matchups} editable={!submitting&&!loadingSaved&&!loadError} onPick={handleSelectWinner} />
        </BracketPickViews>
      </div>
      {view==='mine' && isComplete() && <div style={S.notice}>Champion: <strong>{getChampion()?.name}</strong></div>}
    </BracketFrame>
  );
};

export default FillPage;
