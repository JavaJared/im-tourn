import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_USER_IDS, FEATURES } from '../../config/app.js';
import AuthModal from '../dialogs/AuthModal.jsx';

const Header = ({ onNavigate, currentView }) => {
  const { currentUser, logout } = useAuth();
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
        <div className="logo" onClick={() => onNavigate('home')}>
          I'M TOURN
        </div>

        <nav className="header-nav">
          <button
            className={`nav-link ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => onNavigate('home')}
          >
            Browse
          </button>
          <button
            className={`nav-link weekly ${currentView === 'weekly' ? 'active' : ''}`}
            onClick={() => onNavigate('weekly')}
          >
            Weekly Bracket
          </button>
          <button
            className={`nav-link ${currentView === 'pools' || currentView === 'create-pool' || currentView.startsWith('pool-') ? 'active' : ''}`}
            onClick={() => onNavigate('pools')}
          >
            Bracket Pools
          </button>
          {FEATURES.predictions && (
            <button
              className={`nav-link ${currentView === 'prediction-pools' || currentView === 'create-prediction-pool' || currentView.startsWith('prediction-pool-') ? 'active' : ''}`}
              onClick={() => onNavigate('prediction-pools')}
            >
              Predictions
            </button>
          )}
          <button
            className={`nav-link ${currentView === 'rankings' || currentView === 'create-ranking' || currentView.startsWith('ranking-') ? 'active' : ''}`}
            onClick={() => onNavigate('rankings')}
          >
            Rankings
          </button>
          {FEATURES.drafts && (
            <button
              className={`nav-link ${currentView === 'drafts' || currentView === 'create-draft' || currentView.startsWith('draft-') ? 'active' : ''}`}
              onClick={() => onNavigate('drafts')}
            >
              Drafts
            </button>
          )}
          {FEATURES.pastChampions && (
            <button
              className={`nav-link ${currentView === 'champions' ? 'active' : ''}`}
              onClick={() => onNavigate('champions')}
            >
              Past Champions
            </button>
          )}
        </nav>

        <div className="header-actions">
          {currentUser && currentView === 'home' && (
            <button className="nav-btn" onClick={() => onNavigate('create')}>
              + Create Bracket
            </button>
          )}

          {currentView !== 'home' &&
            currentView !== 'weekly' &&
            currentView !== 'champions' &&
            currentView !== 'pools' &&
            currentView !== 'prediction-pools' &&
            currentView !== 'rankings' &&
            currentView !== 'my-rankings' &&
            currentView !== 'privacy' &&
            currentView !== 'terms' &&
            !currentView.startsWith('pool-') &&
            !currentView.startsWith('prediction-pool-') &&
            !currentView.startsWith('ranking-') &&
            currentView !== 'drafts' &&
            currentView !== 'my-drafts' &&
            !currentView.startsWith('draft-') && (
              <button className="back-btn" onClick={() => onNavigate('home')}>
                ← Back
              </button>
            )}

          {currentUser ? (
            <div className="user-menu-container">
              <button className="user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                <span className="user-avatar">
                  {currentUser.displayName?.[0]?.toUpperCase() ||
                    currentUser.email?.[0]?.toUpperCase()}
                </span>
                <span className="user-name">{currentUser.displayName || 'User'}</span>
              </button>

              {showUserMenu && (
                <div className="user-dropdown">
                  <button
                    onClick={() => {
                      onNavigate('my-brackets');
                      setShowUserMenu(false);
                    }}
                  >
                    My Brackets
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('my-rankings');
                      setShowUserMenu(false);
                    }}
                  >
                    My Rankings
                  </button>
                  {FEATURES.drafts && (
                    <button
                      onClick={() => {
                        onNavigate('my-drafts');
                        setShowUserMenu(false);
                      }}
                    >
                      My Drafts
                    </button>
                  )}
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
