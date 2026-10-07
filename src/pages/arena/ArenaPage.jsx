import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { callServer } from '../../services/server';
import BracketLoader from '../../components/BracketLoader';
import ExploreHeader from '../../components/layout/ExploreHeader';
import ViewLink from '../../components/layout/ViewLink';
import ArenaAdmin, { CreateDebate } from './ArenaAdmin';
import ArenaDiscussion from './ArenaDiscussion';
import './arena.css';

export default function ArenaPage({ roomId, onNavigate }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [tab, setTab] = useState('discussion'), [history, setHistory] = useState([]), [historyCursor, setHistoryCursor] = useState(null), [now, setNow] = useState(Date.now()), [clockOffset, setClockOffset] = useState(0);
  const load = useCallback(async () => {
    try { const result = await callServer(roomId ? 'getGoatDebate' : 'listGoatDebates', roomId ? { roomId } : {}); setData(result); if (result.serverNow) setClockOffset(result.serverNow - Date.now()); setError(''); }
    catch(e) { setError(e.message || 'Debates could not load.'); }
  }, [roomId]);
  useEffect(() => { let active = true; load(); const timer = setInterval(() => { if (active && !document.hidden) load(); }, 60000); return () => { active = false; clearInterval(timer); }; }, [load, currentUser?.uid]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function act(action, extra) {
    setBusy(true); setError('');
    try { await callServer('actOnGoatDebate', { roomId, round: data.room.round, requestId: crypto.randomUUID(), action, ...extra }); await load(); return true; }
    catch(e) { setError(e.message || 'Could not save. Please retry.'); return false; } finally { setBusy(false); }
  }
  async function loadHistory(cursor) {
    try { const result = await callServer('listGoatDiscussion', { roomId, history: true, cursor }); setHistory(old => cursor ? [...old, ...result.items] : result.items); setHistoryCursor(result.nextCursor); }
    catch(e) { setError(e.message); }
  }
  if (!data) return <div className="home-container arena">{error ? <p role="alert">{error} <button onClick={load}>Retry</button></p> : <BracketLoader/>}</div>;
  if (!roomId) return <div className="home-container arena"><ExploreHeader currentView="arena" onNavigate={onNavigate}/><h2>GOAT Arena</h2>{error && <p role="alert">{error}</p>}
    <div className="arena-room-grid">{data.items.map(room => <ViewLink className="arena-panel arena-room-link" key={room.id} view={`debate-${room.id}`} onNavigate={onNavigate}><span>{room.status === 'active' ? 'Live matchup' : 'Paused'}</span><h3>{room.title}</h3><p>{room.matchup.map(id => room.candidates.find(c => c.id === id)?.name).join(' vs. ')}</p></ViewLink>)}</div>
    {!data.items.length && <p>Featured debates are coming soon.</p>}
    {data.nextCursor && <button onClick={async () => { try { const next = await callServer('listGoatDebates', { cursor: data.nextCursor }); setData(old => ({ ...next, items: [...old.items, ...next.items] })); } catch(e) { setError(e.message); } }}>More debates</button>}
    {data.isAdmin && <CreateDebate onCreated={id => onNavigate(`debate-${id}`)}/>}
  </div>;
  const { room, personal, isAdmin } = data;
  const name = id => room.candidates.find(c => c.id === id)?.name || 'Unknown candidate';
  const expired = room.status !== 'active' || now + clockOffset >= room.endAt;
  const disabled = busy || !currentUser || expired || personal?.restricted;
  const seconds = Math.max(0, Math.floor((room.endAt - now - clockOffset) / 1000));
  const eligible = room.candidates.filter(c => !room.matchup.includes(c.id) && room.round - (room.lastPlayed[c.id] ?? -99) >= 2);
  const board = Object.entries(room.stats).sort((a, b) => b[1].wins - a[1].wins || b[1].longest - a[1].longest);
  return <div className="home-container arena">
    <ViewLink view="arena" onNavigate={onNavigate}>GOAT Arena</ViewLink><header className="page-heading"><h1>{room.title}</h1>{personal && <span>{personal.credits} credits</span>}</header>
    <div className="arena-round"><span>Matchup {room.round}</span><span>{room.status === 'paused' ? 'Paused' : seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m remaining` : 'Matchup ended'}{expired && room.status === 'active' && <button onClick={load}>Load next matchup</button>}</span></div>
    <div className="arena-matchup">{room.matchup.map(id => <button className={`arena-candidate${personal?.vote === id ? ' selected' : ''}`} key={id} disabled={disabled || !!personal?.vote} aria-pressed={personal?.vote === id} onClick={() => act('vote', { candidateId: id })}><span>{room.defender === id ? 'GOAT Chair' : 'Challenger'}</span><strong>{name(id)}</strong><span>{room.votes[id] || 0} votes{personal?.vote === id ? ' · Your vote' : ''}</span></button>)}</div>
    {!currentUser && <p>Sign in to vote. Voting is free.</p>}{room.pauseReason && <p>{room.pauseReason}</p>}{personal?.restricted && <p role="status">Your debate access is restricted pending review. Use the site feedback form to appeal.</p>}
    {error && <p role="alert">{error} <button onClick={load}>Refresh</button></p>}
    <nav className="section-switcher" aria-label="Debate sections">{[['discussion','Discussion'], ['challengers','Next challenger'], ['history','GOAT Chair'], ['rules','Rules']].map(([value, label]) => <button className="arena-tab" key={value} aria-pressed={tab === value} onClick={() => { setTab(value); if(value === 'history') loadHistory(); }}>{label}</button>)}</nav>
    {tab === 'discussion' && <ArenaDiscussion room={room} currentUser={currentUser} disabled={disabled || personal?.credits < 1} onAction={act} isAdmin={isAdmin}/>}
    {tab === 'challengers' && <section className="arena-panel"><h2>Next challenger</h2><p>Support one candidate per matchup · 2 credits.</p>{eligible.map(c => <div className="arena-list-row" key={c.id}><strong>{c.name}</strong><span>{room.nominations[c.id] || 0} nominations</span><button className="arena-primary" disabled={disabled || !!personal?.nomination || personal?.credits < 2} onClick={() => act('nominate', { candidateId: c.id })}>{personal?.nomination === c.id ? 'Supported' : 'Support · 2'}</button></div>)}{!eligible.length && <p>No eligible challengers. The room will pause if a replacement is needed.</p>}</section>}
    {tab === 'history' && <section className="arena-panel"><h2>GOAT Chair</h2>{board.length ? <div className="arena-table-wrap"><table><thead><tr><th>Candidate</th><th>Days won</th><th>Longest streak</th></tr></thead><tbody>{board.map(([id, stats]) => <tr key={id}><th>{name(id)}{room.defender === id ? ' · Current chair' : ''}</th><td>{stats.wins}</td><td>{stats.longest}</td></tr>)}</tbody></table></div> : <p>No decided matchups yet.</p>}<h3>Matchup history</h3>{history.map(h => <p key={h.id}>#{h.round} · {h.matchup.map(name).join(' vs. ')} · {h.matchup.map(id => h.votes[id] || 0).join('–')} · {h.winner ? h.tied ? 'Tie — chair retained' : `${name(h.winner)} won` : 'No votes'}</p>)}{historyCursor && <button onClick={() => loadHistory(historyCursor)}>Older matchups</button>}</section>}
    {tab === 'rules' && <section className="arena-panel"><h2>Debate rules</h2><ul><li>Debates stay open indefinitely. Each matchup runs for 24 hours; votes close at the displayed deadline.</li><li>One free vote and one challenger nomination per account per matchup. Votes cannot be changed.</li><li>10 shared credits daily, resetting at midnight UTC without rollover. Comments cost 1; nominations cost 2; creating a featured room costs 5.</li><li>The winner keeps the chair. Ties retain the incumbent (the first listed candidate in the opening matchup), without awarding a win. No votes means a fresh matchup between the same pair.</li><li>The most nominated eligible candidate challenges next. Nomination ties are drawn randomly. Without nominations, the first eligible reserve challenges.</li><li>Candidates must sit out two matchups after an appearance before returning. If no challenger is available, an administrator must add one.</li><li>Chair days count decided wins, not time spent in a paused or tied matchup.</li><li>Featured rooms and candidate lists are curated during this pilot. Comments await review before publication. Abuse may lead to restricted debate access pending review; appeals can be sent through site feedback.</li></ul></section>}
    {isAdmin && <ArenaAdmin room={room} onRefresh={load}/>}
  </div>;
}
