import NotificationBell from '../notifications/NotificationBell';
import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Home, Compass, FolderHeart, UserRound, Users, Shield, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_USER_IDS } from '../../config/app';
import ViewLink from './ViewLink';
import AuthModal from '../dialogs/AuthModal';
import CreateMenu from './CreateMenu';
import { navigationSection } from './navigation';
import { Button } from '../ui/Button';

export function PrimaryNavigation({ currentView, onNavigate }) {
  const active = navigationSection(currentView);
  return <nav className="stadium-nav" aria-label="Primary">
    {[['home','Home',Home],['browse','Explore',Compass],['my-activities','My Stuff',FolderHeart]].map(([view,label,Icon]) =>
      <ViewLink key={view} view={view} currentView={active} onNavigate={onNavigate}><Icon size={19} aria-hidden="true"/><span>{label}</span></ViewLink>)}
    <CreateMenu onNavigate={onNavigate} active={active === 'create'}/>
  </nav>;
}
export default function Header({ onNavigate, currentView }) {
  const { currentUser, username, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false), [authMode, setAuthMode] = useState('login'), [error, setError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const isAdmin = currentUser && ADMIN_USER_IDS.includes(currentUser.uid);
  function authenticate(mode) { setAuthMode(mode); setShowAuth(true); }
  return <>
    <header className="stadium-header">
      <ViewLink className="stadium-wordmark" view="home" onNavigate={onNavigate}>I'M TOURN<span className="sr-only"> home</span></ViewLink>
      <PrimaryNavigation currentView={currentView} onNavigate={onNavigate}/>
      <div className="stadium-account">
        {currentUser ? <><NotificationBell key={currentUser.uid} onNavigate={onNavigate}/>
          <Menu.Root open={accountOpen} onOpenChange={setAccountOpen}><Menu.Trigger asChild><Button className="account-trigger" aria-label="Your account"><span className="account-avatar" aria-hidden="true">{username?.[0]?.toUpperCase() || '•'}</span><span className="account-name">{username ? `@${username}` : 'Account'}</span><ChevronDown size={14} aria-hidden="true"/></Button></Menu.Trigger>
            <Menu.Portal><Menu.Content className="ui-menu" align="end" sideOffset={8} collisionPadding={12} aria-label="Your account">
              {[[UserRound,'profile','Profile'],[Users,'friends','Friends'],...(isAdmin?[[Shield,'admin','Admin panel']]:[])].map(([Icon,view,label]) => <Menu.Item key={view} asChild><ViewLink view={view} onNavigate={view => { setAccountOpen(false); onNavigate(view); }}><Icon size={18} aria-hidden="true"/>{label}</ViewLink></Menu.Item>)}
              <Menu.Separator className="ui-menu-separator"/>
              <Menu.Item onSelect={async () => { try { await logout(); setError(''); } catch { setError('Could not log out. Please retry.'); } }}><LogOut size={18} aria-hidden="true"/>Log out</Menu.Item>
            </Menu.Content></Menu.Portal>
          </Menu.Root></> : <><Button variant="ghost" onClick={() => authenticate('login')}>Log in</Button><Button className="signup-action" onClick={() => authenticate('signup')}>Sign up</Button></>}
      </div>
    </header>
    {error && <p role="alert" className="header-error">{error}</p>}
    <div className="legacy-surface"><AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} initialMode={authMode}/></div>
  </>;
}
