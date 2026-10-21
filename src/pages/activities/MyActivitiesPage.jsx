import BracketLoader from '../../components/BracketLoader';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePagedCatalog } from '../../lib/usePagedCatalog';
import { validateLegacyMatchups } from '../../lib/recordValidation';
import { getBracketById } from '../../services/bracketService';
import { callServer } from '../../services/server';
import DeletePublishedBracketDialog from '../../components/DeletePublishedBracketDialog';
import ActionDialog from '../../components/ActionDialog';
import { deleteBracketDraft } from '../../services/bracketDraftService';
import AuthModal from '../../components/dialogs/AuthModal';
import './activities.css';

const sources = ['brackets','custom','submissions','customSubmissions','hostedPools','joinedPools','rankings','rankingVotes'];
const filters = [['all','Everything'],['attention','Needs attention'],['drafts','Drafts'],['brackets','My brackets'],['saved','Saved picks'],['pools','Pools'],['rankings','Rankings']];
const isPublishedBracket = item => item.catalogType === 'brackets' || (item.catalogType === 'custom' && item.label === 'Created bracket' && (!item.status || ['published','locked','complete'].includes(item.status)));
const isBracketDraft = item => item.catalogType === 'custom' && item.needsAttention && item.label === 'Unpublished bracket';
export default function MyActivitiesPage({ onNavigate, onFillOut, onViewSaved }) {
  const { currentUser } = useAuth();
  const catalog = usePagedCatalog(sources, { endpoint: 'listMyActivities', scope: currentUser?.uid || '', enabled: !!currentUser });
  const [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
  const [opening, setOpening] = useState(''), [error, setError] = useState(''), [signIn, setSignIn] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const [removed, setRemoved] = useState([]);
  const deleteBusy = useRef(false);
  const generation = useRef(0), openingRef = useRef(false);
  useEffect(() => { generation.current++; setDeleteTarget(null); setRemoved([]); setDeleteError(''); setError(''); setOpening(''); openingRef.current = false; return () => { generation.current++; }; }, [currentUser?.uid]);
  const visible = catalog.items.filter(item => !removed.includes(`${item.catalogType}:${item.id}`) && (filter === 'all' || (filter === 'drafts' ? isBracketDraft(item) : filter === 'attention' ? item.needsAttention : item.category === filter)) && item.title.toLowerCase().includes(search.toLowerCase())).sort((a,b) => Number(!!b.needsAttention)-Number(!!a.needsAttention) || b.createdAtMs - a.createdAtMs);
  const removeDraft = async () => {
    if (!deleteTarget || deleteBusy.current) return;
    const target = deleteTarget, version = generation.current;
    deleteBusy.current = true; setDeleting(true); setDeleteError('');
    try {
      await deleteBracketDraft(target.id, currentUser.uid);
      if (version === generation.current) {
        setRemoved(previous => [...previous, `${target.catalogType}:${target.id}`]);
        setDeleteTarget(null);
      }
    } catch (error) {
      if (version === generation.current) setDeleteError(error.message || 'Could not delete the draft. Please retry.');
    } finally { deleteBusy.current = false; setDeleting(false); }
  };
  const open = async item => {
    if (openingRef.current) return;
    if (item.destination) { onNavigate(item.destination); return; }
    const version = generation.current;
    openingRef.current = true; setOpening(`${item.catalogType}:${item.id}`); setError('');
    try {
      if (item.submissionId) {
        const data = { ...await callServer('getMySavedActivity', { type: 'standard', id: item.submissionId }), submissionId: item.submissionId };
        const matchups = validateLegacyMatchups(typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups);
        if (version === generation.current) onViewSaved({ ...data, title: typeof data.title === 'string' ? data.title : 'Saved bracket', category: typeof data.category === 'string' ? data.category : 'Other', size: Number.isFinite(data.size) ? data.size : matchups[0].length * 2, champion: typeof data.champion?.name === 'string' ? { name: data.champion.name } : null, matchups });
      } else {
        const bracket = await getBracketById(item.bracketId);
        if (!bracket) throw Error('This bracket was removed.');
        validateLegacyMatchups(bracket.matchups);
        if (version === generation.current) onFillOut(bracket);
      }
    } catch (error) { if (version === generation.current) setError(error.message || 'Could not open this activity. Please retry.'); }
    finally { if (version === generation.current) { setOpening(''); openingRef.current = false; } }
  };
  if (!currentUser) return <section className="activities-page"><h1>My Stuff</h1><p>Sign in to find your brackets, saved picks, pools, and rankings in one place.</p><button className="nav-btn" onClick={() => setSignIn(true)}>Log in</button><div className="stadium-dialog-surface"><AuthModal isOpen={signIn} onClose={() => setSignIn(false)} initialMode="login" /></div></section>;
  return <section className="activities-page">
    <header className="activities-heading"><div><h1>My Stuff</h1></div><button className="back-btn" disabled={catalog.loading} onClick={catalog.refresh}>Refresh</button></header>
    <div className="activities-shortcuts"><button onClick={() => onNavigate('weekly')}>Weekly bracket →</button><button onClick={() => onNavigate('pools')}>Join a pool →</button></div>
    <div className="activities-controls"><div className="activities-filters" aria-label="Filter activities">{filters.map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><input type="search" aria-label="Search loaded activities" placeholder="Find an activity…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    {(catalog.error || error) && <p role="alert" className="activities-error">{error || catalog.error}</p>}
    {catalog.loading && !catalog.items.length ? <BracketLoader compact label="Loading your activities…" /> : <>
      <p className="activities-count" role="status">{visible.length} loaded {visible.length === 1 ? 'activity' : 'activities'}{catalog.hasMore ? ' · More available below' : ''}</p>
      {!visible.length && <div className="activities-empty"><h2>{catalog.error ? 'Some activities could not load' : catalog.items.length ? 'No matching activities' : 'Your next bracket starts here'}</h2><p>{catalog.error ? 'Retry below. Activities that loaded successfully remain available.' : catalog.items.length ? 'Try another filter or load more activities.' : 'Brackets you create, predictions you submit, and pools you join will appear here.'}</p>{!catalog.items.length && !catalog.error && <button className="nav-btn" onClick={() => onNavigate('browse')}>Explore brackets</button>}</div>}
      <div className="activities-grid">{visible.map(item => <article className="activity-card" key={`${item.catalogType}:${item.id}`}><div className="activity-card-meta"><span>{item.label}</span>{item.needsAttention && <span className="activity-attention">Needs attention</span>}</div><h2>{item.title}</h2><p>{item.status?.replaceAll('_',' ') || 'Saved in your account'}</p>{item.createdAtMs > 0 && <time dateTime={new Date(item.createdAtMs).toISOString()}>{new Date(item.createdAtMs).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>}<div className="activity-card-actions"><button className="back-btn" disabled={!!opening} onClick={() => open(item)}>{opening === `${item.catalogType}:${item.id}` ? 'Opening…' : item.action} <span aria-hidden="true">→</span></button>{isBracketDraft(item) && <button className="back-btn activity-delete" onClick={() => { setDeleteError(''); setDeleteTarget(item); }}>Delete draft</button>}{isPublishedBracket(item) && <button className="back-btn activity-delete" onClick={() => setDeleteTarget(item)}>Delete bracket</button>}</div></article>)}</div>
    </>}
    {deleteTarget && isBracketDraft(deleteTarget) && <ActionDialog title="Delete this draft?" onClose={() => { if (!deleteBusy.current) setDeleteTarget(null); }}>
      <p>“{deleteTarget.title}” will be permanently deleted. Published brackets, saved picks, and pools will not be removed.</p>
      {deleteError && <p role="alert" className="activities-error">{deleteError}</p>}
      <div className="activity-card-actions">
        <button className="back-btn" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button>
        <button className="back-btn activity-delete" disabled={deleting} onClick={removeDraft}>{deleting ? 'Deleting…' : deleteError ? 'Retry deletion' : 'Delete draft'}</button>
      </div>
    </ActionDialog>}
    {deleteTarget && isPublishedBracket(deleteTarget) && <DeletePublishedBracketDialog bracketId={deleteTarget.id} type={deleteTarget.catalogType === 'brackets' ? 'legacy' : 'custom'} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); catalog.refresh(); }} />}
    {catalog.hasMore && <div className="activities-more"><p>Filters and search apply to activities loaded so far.</p><button className="nav-btn" disabled={catalog.loading} onClick={catalog.loadMore}>{catalog.loading ? <BracketLoader inline label="Loading…" /> : catalog.error ? 'Retry loading activities' : 'Load more activities'}</button></div>}
  </section>;
}
