import NotificationBell from '../notifications/NotificationBell';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_USER_IDS, FEATURES } from '../../config/app.js';
import ViewLink from './ViewLink.jsx';
import AuthModal from '../dialogs/AuthModal.jsx';

const Header = ({ onNavigate, currentView }) => {
  const { currentUser, username, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = currentUser && ADMIN_USER_IDS.includes(currentUser.uid);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <>
      <header className="header">
        <ViewLink className="logo" view="home" onNavigate={onNavigate}>
          I'M TOURN<span className="sr-only"> home</span>
        </ViewLink>

        <nav className="header-nav" aria-label="Primary">
          <ViewLink
            className={`nav-link ${currentView === 'home' ? 'active' : ''}`}
            view="home" onNavigate={onNavigate} currentView={currentView}
          >
            For You
          </ViewLink>
          <ViewLink
            className={`nav-link ${['browse','rankings','weekly'].includes(currentView) ? 'active' : ''}`}
            view="browse" onNavigate={onNavigate} currentView={['browse','rankings','weekly'].includes(currentView)?'browse':currentView}
          >
            Explore
          </ViewLink>
          <ViewLink
            className={`nav-link ${currentView === 'pools' || currentView === 'create-pool' || currentView.startsWith('pool-') ? 'active' : ''}`}
            view="pools" onNavigate={onNavigate} currentView={currentView}
          >
            Pools
          </ViewLink>
          {FEATURES.predictions && (
            <ViewLink
              className={`nav-link ${currentView === 'prediction-pools' || currentView === 'create-prediction-pool' || currentView.startsWith('prediction-pool-') ? 'active' : ''}`}
              view="prediction-pools" onNavigate={onNavigate} currentView={currentView}
            >
              Predictions
            </ViewLink>
          )}
          {FEATURES.drafts && (
            <ViewLink
              className={`nav-link ${currentView === 'drafts' || currentView === 'create-draft' || currentView.startsWith('draft-') ? 'active' : ''}`}
              view="drafts" onNavigate={onNavigate} currentView={currentView}
            >
              Drafts
            </ViewLink>
          )}
          {FEATURES.pastChampions && (
            <ViewLink
              className={`nav-link ${currentView === 'champions' ? 'active' : ''}`}
              view="champions" onNavigate={onNavigate} currentView={currentView}
            >
              Past Champions
            </ViewLink>
          )}
        </nav>

        <div className="header-actions">
          {currentUser && <NotificationBell key={currentUser.uid} onNavigate={onNavigate} />}
          {currentUser ? (
            <div className="user-menu-container" onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setShowUserMenu(false);
                event.currentTarget.querySelector('.user-btn')?.focus();
              }
            }} onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setShowUserMenu(false);
            }}>
              <button className="user-btn" aria-expanded={showUserMenu} aria-controls="account-links" onClick={() => setShowUserMenu(!showUserMenu)}>
                <span className="user-avatar">
                  {username?.[0]?.toUpperCase() ||
                    currentUser.email?.[0]?.toUpperCase()}
                </span>
                <span className="user-name">{username ? `@${username}` : '…'}</span>
              </button>

              {showUserMenu && (
                <div className="user-dropdown" id="account-links">
                  <button onClick={() => { onNavigate('profile'); setShowUserMenu(false); }}>Profile</button>
                  <button onClick={() => { onNavigate('my-activities'); setShowUserMenu(false); }}>My Activities</button>
                  <button onClick={() => { onNavigate('friends'); setShowUserMenu(false); }}>Friends</button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        onNavigate('admin');
                        setShowUserMenu(false);
                      }}
                    >
                      Admin Panel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-buttons">
              <button className="back-btn" onClick={() => openAuth('login')}>
                Log In
              </button>
              <button className="nav-btn" onClick={() => openAuth('signup')}>
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />
    </>
  );
};

export default Header;
