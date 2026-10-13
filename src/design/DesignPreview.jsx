// Development-only component catalog. Fixtures never call or write backend data.
import React from 'react';
import CompetitionPreview from './CompetitionPreview';
import { createRoot } from 'react-dom/client';
import { Trophy, ArrowRight, Check, Bell } from 'lucide-react';
import { PrimaryNavigation } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ArenaMatchup from '../pages/arena/ArenaMatchup';
import FeedSkeleton from '../components/ui/FeedSkeleton';
import '../App.css';
import '../pages/feed/feed.css';
import '../pages/arena/arena.css';
import './preview.css';
const room={matchup:['a','b'],candidates:[{id:'a',name:'Michael Jordan'},{id:'b',name:'LeBron James'}],votes:{a:62,b:38},defender:'a'};
function LogoMark({round=false}) { return <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><rect width="48" height="48" rx={round?24:10} fill="currentColor"/><path d="M10 12h10v12h10M10 36h10V24m10-8v16h8" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round"/></svg>; }
function Preview() {
  const [view,setView]=React.useState('home'),[vote,setVote]=React.useState(null);
  return <div className="bracket-app"><header className="stadium-header"><a href="#" className="stadium-wordmark">I'M TOURN</a><PrimaryNavigation currentView={view} onNavigate={setView}/><div className="stadium-account"><Bell aria-label="Notifications"/><span className="account-avatar">J</span></div></header>
    <main className="stadium-surface preview-page"><p className="preview-note">Design review · fixture content · not connected to live data</p><h1>Make your picks. Prove your point.</h1>
      <div className="preview-grid"><section><h2 className="preview-label">01 / Social competition</h2><article className="feed-card"><header className="feed-card-header"><div className="feed-author"><span className="feed-avatar">J</span><div><strong>@jared</strong><span className="feed-reason">From your community</span></div></div></header><div className="feed-card-body"><div className="feed-tags"><Badge tone="brand">Bracket</Badge><Badge>Food & drinks</Badge></div><h2>The ultimate game-day food</h2><div className="preview-bracket">{['Wings','Pizza','Tacos','Nachos'].map((name,i)=><div key={name}><span>{i+1}</span><strong>{name}</strong>{i===1&&<Check size={18}/>}</div>)}</div></div><footer><span>16 entries</span><Button variant="primary" className="feed-participate">Fill out bracket<ArrowRight size={18}/></Button></footer></article></section>
      <section className="arena"><h2 className="preview-label">02 / GOAT Arena</h2><h2>Greatest basketball player?</h2><ArenaMatchup room={room} vote={vote} onVote={setVote}/><div className="preview-tools">{vote && <Badge tone="success">Vote recorded</Badge>}<Button onClick={()=>setVote(null)}>Reset example vote</Button></div></section></div>
      <section className="preview-section"><h2>Identity directions — for review</h2><div className="preview-logos"><div><LogoMark/><strong className="logo-a">I'M TOURN</strong><span>A / Athletic bracket</span></div><div><LogoMark round/><strong className="logo-b">i’m tourn.</strong><span>B / Social competition</span></div></div></section>
      <section className="preview-section"><h2>Shared states</h2><div className="preview-tools"><Button variant="primary">Primary action</Button><Button>Secondary</Button><Button disabled>Saving…</Button><Badge tone="success">Alive</Badge><Badge tone="accent"><Trophy size={14}/>Champion</Badge></div><FeedSkeleton/></section>
      <CompetitionPreview/>
    </main></div>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
