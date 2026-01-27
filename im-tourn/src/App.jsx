// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
  createBracket, 
  getAllBrackets, 
  getUserBrackets,
  deleteBracket,
  submitFilledBracket,
  get32EntryBrackets,
  getWeeklyBracket,
  setWeeklyBracket,
  submitWeeklyVote,
  hasUserVotedForRound,
  getUserVotesForRound,
  advanceWeeklyBracket,
  clearWeeklyBracket
} from './services/bracketService';
import './App.css';

// Admin user IDs (add your Firebase user ID here)
const ADMIN_USER_IDS = ['YOUR_ADMIN_USER_ID_HERE'];

const CATEGORIES = [
  'Movies', 'TV Shows', 'Books', 'Sports Teams', 'Video Games',
  'Music Artists', 'Food & Drinks', 'Anime', 'Superheroes', 'Historical Figures', 'Other'
];

const generateMatchups = (entries) => {
  const size = entries.length;
  const rounds = Math.log2(size);
  const bracket = [];
  
  const getSeedOrder = (n) => {
    if (n === 2) return [0, 1];
    const half = getSeedOrder(n / 2);
    return half.flatMap((seed) => [seed, n - 1 - seed]);
  };
  
  const seedOrder = getSeedOrder(size);
  const firstRound = [];
  
  for (let i = 0; i < size / 2; i++) {
    firstRound.push({
      id: `r0-m${i}`,
      entry1: { ...entries[seedOrder[i * 2]], seed: seedOrder[i * 2] + 1 },
      entry2: { ...entries[seedOrder[i * 2 + 1]], seed: seedOrder[i * 2 + 1] + 1 },
      winner: null
    });
  }
  bracket.push(firstRound);
  
  let matchesInRound = size / 4;
  for (let r = 1; r < rounds; r++) {
    const round = [];
    for (let m = 0; m < matchesInRound; m++) {
      round.push({ id: `r${r}-m${m}`, entry1: null, entry2: null, winner: null });
    }
    bracket.push(round);
    matchesInRound /= 2;
  }
  
  return bracket;
};

// Auth Modal Component
const AuthModal = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup, login, loginWithGoogle } = useAuth();

  useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signup(email, password, displayName);
      } else {
        await login(email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, ''));
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, ''));
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className="modal-title">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          
          <button type="submit" className="publish-btn" disabled={loading}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Sign Up')}
          </button>
        </form>
        
        <div className="auth-divider">
          <span>or</span>
        </div>
        
        <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        
        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
};

// Header Component
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
        <div className="logo" onClick={() => onNavigate('home')}>I'M TOURN</div>
        
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
        </nav>
        
        <div className="header-actions">
          {currentUser && currentView === 'home' && (
            <button className="nav-btn" onClick={() => onNavigate('create')}>
              + Create Bracket
            </button>
          )}
          
          {currentView !== 'home' && currentView !== 'weekly' && (
            <button className="back-btn" onClick={() => onNavigate('home')}>
              ← Back
            </button>
          )}
          
          {currentUser ? (
            <div className="user-menu-container">
              <button className="user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                <span className="user-avatar">
                  {currentUser.displayName?.[0]?.toUpperCase() || currentUser.email?.[0]?.toUpperCase()}
                </span>
                <span className="user-name">{currentUser.displayName || 'User'}</span>
              </button>
              
              {showUserMenu && (
                <div className="user-dropdown">
                  <button onClick={() => { onNavigate('my-brackets'); setShowUserMenu(false); }}>
                    My Brackets
                  </button>
                  {isAdmin && (
                    <button onClick={() => { onNavigate('admin'); setShowUserMenu(false); }}>
                      Admin Panel
                    </button>
                  )}
                  <button onClick={() => { logout(); setShowUserMenu(false); }}>
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-buttons">
              <button className="back-btn" onClick={() => openAuth('login')}>Log In</button>
              <button className="nav-btn" onClick={() => openAuth('signup')}>Sign Up</button>
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

// Home Page Component
const HomePage = ({ onFillOut, onNavigate }) => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const { currentUser } = useAuth();

  useEffect(() => {
    loadBrackets();
  }, []);

  const loadBrackets = async () => {
    try {
      const data = await getAllBrackets();
      setBrackets(data);
    } catch (error) {
      console.error('Error loading brackets:', error);
    }
    setLoading(false);
  };

  // Get unique categories from brackets
  const categories = [...new Set(brackets.map(b => b.category))].sort();

  // Filter and sort brackets
  const filteredBrackets = brackets
    .filter(bracket => {
      const matchesSearch = bracket.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || bracket.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'title-az':
          return a.title.localeCompare(b.title);
        case 'title-za':
          return b.title.localeCompare(a.title);
        case 'size-large':
          return b.size - a.size;
        case 'size-small':
          return a.size - b.size;
        default:
          return 0;
      }
    });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSortBy('newest');
  };

  const hasActiveFilters = searchTerm || selectedCategory || sortBy !== 'newest';

  return (
    <div className="home-container">
      <div className="hero">
        <h1>CREATE YOUR <span>ULTIMATE</span> BRACKET</h1>
        <p>Design custom tournament brackets for anything—movies, shows, teams, and more. Share them with friends and settle the debate once and for all.</p>
        {!currentUser && (
          <p className="hero-cta">Sign up to create and share your own brackets!</p>
        )}
      </div>
      
      <div className="section-title">BROWSE BRACKETS</div>
      
      {/* Search and Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search brackets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>×</button>
          )}
        </div>
        
        <div className="filter-controls">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title-az">Title A-Z</option>
            <option value="title-za">Title Z-A</option>
            <option value="size-large">Largest Size</option>
            <option value="size-small">Smallest Size</option>
          </select>
          
          {hasActiveFilters && (
            <button className="clear-filters-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>
      
      {/* Results count */}
      {!loading && brackets.length > 0 && (
        <div className="results-count">
          Showing {filteredBrackets.length} of {brackets.length} brackets
          {selectedCategory && ` in ${selectedCategory}`}
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}
      
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading brackets...</p>
        </div>
      ) : brackets.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <p>No brackets yet. Be the first to create one!</p>
        </div>
      ) : filteredBrackets.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <p>No brackets match your search.</p>
          <button className="clear-filters-btn" onClick={clearFilters} style={{marginTop: '1rem'}}>
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="brackets-grid">
          {filteredBrackets.map(bracket => (
            <div key={bracket.id} className="bracket-card">
              <span className="bracket-category">{bracket.category}</span>
              <h3 className="bracket-title">{bracket.title}</h3>
              {bracket.description && <p className="bracket-description">{bracket.description}</p>}
              <div className="bracket-meta">
                <div className="bracket-info">
                  <span className="bracket-size"><span>{bracket.size}</span> entries</span>
                  <span className="bracket-author">by {bracket.userDisplayName}</span>
                </div>
                <button className="fill-btn" onClick={() => onFillOut(bracket)}>Fill Out →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// My Brackets Page
const MyBracketsPage = ({ onFillOut, onNavigate }) => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadUserBrackets();
    }
  }, [currentUser]);

  const loadUserBrackets = async () => {
    try {
      const data = await getUserBrackets(currentUser.uid);
      setBrackets(data);
    } catch (error) {
      console.error('Error loading brackets:', error);
    }
    setLoading(false);
  };

  const handleDelete = async (bracketId) => {
    if (window.confirm('Are you sure you want to delete this bracket?')) {
      try {
        await deleteBracket(bracketId);
        setBrackets(brackets.filter(b => b.id !== bracketId));
      } catch (error) {
        console.error('Error deleting bracket:', error);
      }
    }
  };

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>My Brackets</h1>
        <p>Brackets you've created</p>
      </div>
      
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your brackets...</p>
        </div>
      ) : brackets.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <p>You haven't created any brackets yet.</p>
          <button className="nav-btn" onClick={() => onNavigate('create')} style={{marginTop: '1rem'}}>
            Create Your First Bracket
          </button>
        </div>
      ) : (
        <div className="brackets-grid">
          {brackets.map(bracket => (
            <div key={bracket.id} className="bracket-card">
              <span className="bracket-category">{bracket.category}</span>
              <h3 className="bracket-title">{bracket.title}</h3>
              {bracket.description && <p className="bracket-description">{bracket.description}</p>}
              <div className="bracket-meta">
                <span className="bracket-size"><span>{bracket.size}</span> entries • {bracket.createdAt}</span>
                <div className="bracket-actions">
                  <button className="fill-btn" onClick={() => onFillOut(bracket)}>Fill Out</button>
                  <button className="delete-btn" onClick={() => handleDelete(bracket.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Weekly Bracket Page Component
const WeeklyBracketPage = () => {
  const [weeklyBracket, setWeeklyBracketState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userVotes, setUserVotes] = useState({});
  const [hasVoted, setHasVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const { currentUser } = useAuth();

  // Day of week determines active round (0 = Sunday)
  // Monday = Round 1 (index 0), Tuesday = Round 2, etc.
  const getDayInfo = () => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Map days to rounds (Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4)
    const dayToRound = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 5 };
    const activeRound = dayToRound[day] ?? 0;
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const roundNames = ['Round of 32', 'Sweet 16', 'Elite 8', 'Final 4', 'Championship', 'Complete'];
    
    return {
      dayName: dayNames[day],
      activeRound,
      roundName: roundNames[Math.min(activeRound, 5)],
      isWeekend: day === 0 || day === 6
    };
  };

  const dayInfo = getDayInfo();

  useEffect(() => {
    loadWeeklyBracket();
  }, []);

  useEffect(() => {
    if (currentUser && weeklyBracket) {
      checkUserVoted();
    }
  }, [currentUser, weeklyBracket, dayInfo.activeRound]);

  const loadWeeklyBracket = async () => {
    try {
      const data = await getWeeklyBracket();
      setWeeklyBracketState(data);
    } catch (error) {
      console.error('Error loading weekly bracket:', error);
    }
    setLoading(false);
  };

  const checkUserVoted = async () => {
    if (!currentUser) return;
    try {
      const voted = await hasUserVotedForRound(currentUser.uid, dayInfo.activeRound);
      setHasVoted(voted);
      if (voted) {
        const votes = await getUserVotesForRound(currentUser.uid, dayInfo.activeRound);
        setUserVotes(votes || {});
        setShowResults(true);
      }
    } catch (error) {
      console.error('Error checking vote status:', error);
    }
  };

  const handleVoteSelect = (matchId, selection) => {
    if (hasVoted) return;
    setUserVotes(prev => ({ ...prev, [matchId]: selection }));
  };

  const handleSubmitVotes = async () => {
    if (!currentUser) {
      alert('Please log in to vote');
      return;
    }

    const activeMatchups = weeklyBracket.matchups[dayInfo.activeRound];
    const allVoted = activeMatchups.every((_, idx) => 
      userVotes[`r${dayInfo.activeRound}-m${idx}`]
    );

    if (!allVoted) {
      alert('Please vote on all matchups before submitting');
      return;
    }

    setSubmitting(true);
    try {
      await submitWeeklyVote(currentUser.uid, dayInfo.activeRound, userVotes);
      setHasVoted(true);
      setShowResults(true);
      await loadWeeklyBracket(); // Reload to get updated vote counts
    } catch (error) {
      console.error('Error submitting votes:', error);
      alert('Failed to submit votes. Please try again.');
    }
    setSubmitting(false);
  };

  const getRoundName = (roundIndex) => {
    const names = ['Round of 32', 'Sweet 16', 'Elite 8', 'Final 4', 'Championship'];
    return names[roundIndex] || `Round ${roundIndex + 1}`;
  };

  const getVotePercentage = (matchId, entry) => {
    if (!weeklyBracket?.votes?.[matchId]) return 0;
    const { entry1, entry2 } = weeklyBracket.votes[matchId];
    const total = entry1 + entry2;
    if (total === 0) return 50;
    return Math.round((entry === 1 ? entry1 : entry2) / total * 100);
  };

  const getTotalVotes = (matchId) => {
    if (!weeklyBracket?.votes?.[matchId]) return 0;
    const { entry1, entry2 } = weeklyBracket.votes[matchId];
    return entry1 + entry2;
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading weekly bracket...</p>
        </div>
      </div>
    );
  }

  if (!weeklyBracket) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>Weekly Bracket</h1>
          <p>Vote on this week's community bracket!</p>
        </div>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p>No weekly bracket has been set yet. Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Weekly Bracket</h1>
        <p>{weeklyBracket.title} • {weeklyBracket.category}</p>
      </div>

      <div className="weekly-info-bar">
        <div className="day-indicator">
          <span className="day-label">Today:</span>
          <span className="day-value">{dayInfo.dayName}</span>
        </div>
        <div className="round-indicator">
          <span className="round-label">Active Round:</span>
          <span className="round-value">{dayInfo.roundName}</span>
        </div>
        {hasVoted && (
          <div className="voted-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            You've voted!
          </div>
        )}
      </div>

      <div className="weekly-bracket-container">
        {weeklyBracket.matchups.map((round, roundIndex) => {
          const isActive = roundIndex === dayInfo.activeRound;
          const isPast = roundIndex < dayInfo.activeRound;
          const isFuture = roundIndex > dayInfo.activeRound;

          return (
            <div 
              key={roundIndex} 
              className={`weekly-round ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
            >
              <div className="weekly-round-title">
                {getRoundName(roundIndex)}
                {isActive && <span className="active-badge">VOTE NOW</span>}
                {isPast && <span className="complete-badge">COMPLETE</span>}
              </div>
              
              <div className="weekly-matchups">
                {round.map((match, matchIndex) => {
                  const matchId = `r${roundIndex}-m${matchIndex}`;
                  const userSelection = userVotes[matchId];
                  const showVoteResults = (showResults && isActive) || isPast;

                  return (
                    <div key={matchId} className={`weekly-matchup ${isActive ? 'voteable' : ''}`}>
                      <div 
                        className={`weekly-entry ${userSelection === 1 ? 'selected' : ''} ${match.winner === 1 ? 'winner' : ''}`}
                        onClick={() => isActive && !hasVoted && match.entry1 && handleVoteSelect(matchId, 1)}
                      >
                        {match.entry1 ? (
                          <>
                            <span className="weekly-seed">{match.entry1.seed}</span>
                            <span className="weekly-name">{match.entry1.name}</span>
                            {showVoteResults && (
                              <div className="vote-bar">
                                <div 
                                  className="vote-fill" 
                                  style={{ width: `${getVotePercentage(matchId, 1)}%` }}
                                />
                                <span className="vote-percent">{getVotePercentage(matchId, 1)}%</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="weekly-name tbd">TBD</span>
                        )}
                      </div>
                      
                      <div 
                        className={`weekly-entry ${userSelection === 2 ? 'selected' : ''} ${match.winner === 2 ? 'winner' : ''}`}
                        onClick={() => isActive && !hasVoted && match.entry2 && handleVoteSelect(matchId, 2)}
                      >
                        {match.entry2 ? (
                          <>
                            <span className="weekly-seed">{match.entry2.seed}</span>
                            <span className="weekly-name">{match.entry2.name}</span>
                            {showVoteResults && (
                              <div className="vote-bar">
                                <div 
                                  className="vote-fill" 
                                  style={{ width: `${getVotePercentage(matchId, 2)}%` }}
                                />
                                <span className="vote-percent">{getVotePercentage(matchId, 2)}%</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="weekly-name tbd">TBD</span>
                        )}
                      </div>
                      
                      {showVoteResults && (
                        <div className="total-votes">
                          {getTotalVotes(matchId)} votes
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!hasVoted && currentUser && dayInfo.activeRound < weeklyBracket.matchups.length && (
        <div className="vote-submit-section">
          <button 
            className="submit-votes-btn" 
            onClick={handleSubmitVotes}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Votes'}
          </button>
        </div>
      )}

      {!currentUser && (
        <div className="login-prompt">
          <p>Log in to vote on this week's bracket!</p>
        </div>
      )}

      {weeklyBracket.matchups[weeklyBracket.matchups.length - 1][0].winner && (
        <div className="weekly-champion">
          <div className="champion-label">WEEKLY CHAMPION</div>
          <div className="champion-name">
            {weeklyBracket.matchups[weeklyBracket.matchups.length - 1][0].winner === 1
              ? weeklyBracket.matchups[weeklyBracket.matchups.length - 1][0].entry1?.name
              : weeklyBracket.matchups[weeklyBracket.matchups.length - 1][0].entry2?.name
            }
          </div>
        </div>
      )}
    </div>
  );
};

// Admin Page Component
const AdminPage = () => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewBracket, setPreviewBracket] = useState(null);
  const [currentWeekly, setCurrentWeekly] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { currentUser } = useAuth();

  const isAdmin = currentUser && ADMIN_USER_IDS.includes(currentUser.uid);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      const [bracketsData, weeklyData] = await Promise.all([
        get32EntryBrackets(),
        getWeeklyBracket()
      ]);
      setBrackets(bracketsData);
      setCurrentWeekly(weeklyData);
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
    setLoading(false);
  };

  const handleRandomBracket = () => {
    if (brackets.length === 0) {
      alert('No 32-entry brackets available');
      return;
    }
    const randomIndex = Math.floor(Math.random() * brackets.length);
    setPreviewBracket(brackets[randomIndex]);
  };

  const handleConfirmBracket = async () => {
    if (!previewBracket) return;
    
    setActionLoading(true);
    try {
      await setWeeklyBracket(previewBracket);
      setCurrentWeekly(previewBracket);
      setPreviewBracket(null);
      alert('Weekly bracket has been set!');
    } catch (error) {
      console.error('Error setting weekly bracket:', error);
      alert('Failed to set weekly bracket');
    }
    setActionLoading(false);
  };

  const handleAdvanceRound = async () => {
    if (!confirm('Are you sure you want to advance to the next round? This will determine winners based on current votes.')) {
      return;
    }
    
    setActionLoading(true);
    try {
      await advanceWeeklyBracket();
      await loadData();
      alert('Bracket advanced to next round!');
    } catch (error) {
      console.error('Error advancing bracket:', error);
      alert('Failed to advance bracket');
    }
    setActionLoading(false);
  };

  const handleClearBracket = async () => {
    if (!confirm('Are you sure you want to clear the weekly bracket? This will delete all votes.')) {
      return;
    }
    
    setActionLoading(true);
    try {
      await clearWeeklyBracket();
      setCurrentWeekly(null);
      alert('Weekly bracket cleared!');
    } catch (error) {
      console.error('Error clearing bracket:', error);
      alert('Failed to clear bracket');
    }
    setActionLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V4"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <p>Access denied. Admin privileges required.</p>
          {currentUser && <p style={{fontSize: '0.8rem', marginTop: '1rem', color: 'var(--text-muted)'}}>Your User ID: {currentUser.uid}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Manage the weekly bracket</p>
      </div>

      {/* Current Weekly Bracket Status */}
      <div className="admin-section">
        <h2 className="admin-section-title">Current Weekly Bracket</h2>
        {currentWeekly ? (
          <div className="current-weekly-info">
            <div className="weekly-detail">
              <span className="label">Title:</span>
              <span className="value">{currentWeekly.title}</span>
            </div>
            <div className="weekly-detail">
              <span className="label">Category:</span>
              <span className="value">{currentWeekly.category}</span>
            </div>
            <div className="weekly-detail">
              <span className="label">Current Round:</span>
              <span className="value">{currentWeekly.currentRound + 1} of 5</span>
            </div>
            <div className="admin-actions">
              <button 
                className="admin-btn advance" 
                onClick={handleAdvanceRound}
                disabled={actionLoading}
              >
                Advance to Next Round
              </button>
              <button 
                className="admin-btn danger" 
                onClick={handleClearBracket}
                disabled={actionLoading}
              >
                Clear Weekly Bracket
              </button>
            </div>
          </div>
        ) : (
          <p className="no-weekly">No weekly bracket is currently set.</p>
        )}
      </div>

      {/* Select New Bracket */}
      <div className="admin-section">
        <h2 className="admin-section-title">Select New Weekly Bracket</h2>
        <p className="admin-hint">Available 32-entry brackets: {brackets.length}</p>
        
        <button 
          className="admin-btn primary" 
          onClick={handleRandomBracket}
          disabled={brackets.length === 0}
        >
          🎲 Pull Random Bracket
        </button>

        {previewBracket && (
          <div className="preview-bracket-card">
            <h3>{previewBracket.title}</h3>
            <p className="preview-meta">
              {previewBracket.category} • Created by {previewBracket.userDisplayName}
            </p>
            <div className="preview-entries">
              <strong>Entries:</strong>
              <div className="entries-preview">
                {previewBracket.entries.map((entry, idx) => (
                  <span key={idx} className="entry-chip">{entry.name}</span>
                ))}
              </div>
            </div>
            <div className="preview-actions">
              <button 
                className="admin-btn success" 
                onClick={handleConfirmBracket}
                disabled={actionLoading}
              >
                ✓ Confirm for This Week
              </button>
              <button 
                className="admin-btn secondary" 
                onClick={handleRandomBracket}
              >
                ↻ Try Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Create Page Component
const CreatePage = ({ onPublish, onNavigate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [size, setSize] = useState(null);
  const [entries, setEntries] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const { currentUser } = useAuth();
  
  const handleSizeSelect = (newSize) => {
    setSize(newSize);
    setEntries(Array(newSize).fill('').map((_, i) => ({ id: i, name: '' })));
  };
  
  const handleEntryChange = (index, value) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], name: value };
    setEntries(newEntries);
  };
  
  const isValid = title && category && size && entries.every(e => e.name.trim());
  
  const handlePublish = async () => {
    if (!isValid || !currentUser) return;
    
    setPublishing(true);
    try {
      const bracketData = {
        title,
        description,
        category,
        size,
        entries,
        matchups: generateMatchups(entries)
      };
      
      console.log('Publishing bracket with data:', bracketData);
      console.log('User ID:', currentUser.uid);
      console.log('Display Name:', currentUser.displayName);
      
      await createBracket(bracketData, currentUser.uid, currentUser.displayName);
      onNavigate('home');
    } catch (error) {
      console.error('Error publishing bracket:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      alert(`Failed to publish bracket.\n\nError: ${error.code || 'Unknown'}\n${error.message || 'Please try again.'}`);
    }
    setPublishing(false);
  };
  
  if (!currentUser) {
    return (
      <div className="create-container">
        <div className="empty-state">
          <p>Please log in to create a bracket.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="create-container">
      <div className="create-header">
        <h1>CREATE A BRACKET</h1>
        <p>Set up your tournament and add your entries</p>
      </div>
      
      <div className="form-card">
        <div className="form-group">
          <label className="form-label">Bracket Title *</label>
          <input type="text" className="form-input" placeholder="e.g., Best Marvel Movies" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        
        <div className="form-group">
          <label className="form-label">Description (Optional)</label>
          <textarea className="form-input form-textarea" placeholder="Add a short description..." value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        
        <div className="form-group">
          <label className="form-label">Category *</label>
          <select className="form-input form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select a category...</option>
            {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        
        <div className="form-group">
          <label className="form-label">Bracket Size *</label>
          <div className="size-options">
            {[4, 8, 16, 32].map(num => (
              <div key={num} className={`size-option ${size === num ? 'selected' : ''}`} onClick={() => handleSizeSelect(num)}>
                <div className="number">{num}</div>
                <div className="label">entries</div>
              </div>
            ))}
          </div>
        </div>
        
        {size && (
          <div className="entries-section">
            <div className="entries-header">
              <span className="entries-title">ENTRIES</span>
              <span className="entries-count">{entries.filter(e => e.name).length} / {size} filled</span>
            </div>
            <div className="entries-list">
              {entries.map((entry, index) => (
                <div key={index} className="entry-row">
                  <div className="entry-seed">{index + 1}</div>
                  <input type="text" className="entry-input" placeholder={`Entry #${index + 1}`} value={entry.name} onChange={(e) => handleEntryChange(index, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        )}
        
        <button className="publish-btn" disabled={!isValid || publishing} onClick={handlePublish}>
          {publishing ? 'Publishing...' : 'PUBLISH BRACKET'}
        </button>
      </div>
    </div>
  );
};

// Fill Page Component
const FillPage = ({ bracket, onSubmit, onBack }) => {
  const [matchups, setMatchups] = useState(bracket.matchups);
  const { currentUser } = useAuth();
  
  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'FINALS';
    if (remaining === 2) return 'SEMI-FINALS';
    if (remaining === 3) return 'QUARTER-FINALS';
    return `ROUND ${roundIndex + 1}`;
  };
  
  const handleSelectWinner = (roundIndex, matchIndex, entryNum) => {
    const newMatchups = matchups.map(round => round.map(match => ({ ...match })));
    const match = newMatchups[roundIndex][matchIndex];
    const selectedEntry = entryNum === 1 ? match.entry1 : match.entry2;
    
    if (!selectedEntry) return;
    
    match.winner = entryNum;
    
    for (let r = roundIndex + 1; r < newMatchups.length; r++) {
      for (let m = 0; m < newMatchups[r].length; m++) {
        if (r === roundIndex + 1) {
          const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
          newMatchups[r][Math.floor(matchIndex / 2)][entrySlot] = selectedEntry;
          newMatchups[r][Math.floor(matchIndex / 2)].winner = null;
        } else {
          newMatchups[r][m].entry1 = null;
          newMatchups[r][m].entry2 = null;
          newMatchups[r][m].winner = null;
        }
      }
    }
    
    for (let r = roundIndex + 1; r < newMatchups.length; r++) {
      for (let m = 0; m < newMatchups[r].length; m++) {
        const prevRound = newMatchups[r - 1];
        const match1 = prevRound[m * 2];
        const match2 = prevRound[m * 2 + 1];
        if (match1?.winner) newMatchups[r][m].entry1 = match1.winner === 1 ? match1.entry1 : match1.entry2;
        if (match2?.winner) newMatchups[r][m].entry2 = match2.winner === 1 ? match2.entry1 : match2.entry2;
      }
    }
    
    setMatchups(newMatchups);
  };
  
  const isComplete = () => matchups[matchups.length - 1][0].winner !== null;
  
  const getChampion = () => {
    const finalMatch = matchups[matchups.length - 1][0];
    return finalMatch.winner ? (finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2) : null;
  };
  
  const handleSubmit = async () => {
    const filledBracket = { ...bracket, matchups, champion: getChampion() };
    
    if (currentUser) {
      try {
        await submitFilledBracket(
          { matchups, champion: getChampion() },
          bracket.id,
          currentUser.uid,
          currentUser.displayName
        );
      } catch (error) {
        console.error('Error saving submission:', error);
      }
    }
    
    onSubmit(filledBracket);
  };

  const downloadBlankBracket = async () => {
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    
    // Create landscape letter PDF
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Colors
    const orange = [255, 107, 53];
    const darkGray = [51, 51, 51];
    const mediumGray = [102, 102, 102];
    const borderGray = [180, 180, 180];
    const lightBg = [250, 250, 250];
    const white = [255, 255, 255];
    
    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...darkGray);
    pdf.text(bracket.title, pageWidth / 2, 40, { align: 'center' });
    
    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...mediumGray);
    pdf.text(`${bracket.category} • ${bracket.size} Entries`, pageWidth / 2, 58, { align: 'center' });
    
    // Bracket dimensions
    const blankMatchups = bracket.matchups;
    const numRounds = blankMatchups.length;
    const margin = 30;
    const bracketTop = 80;
    const bracketWidth = pageWidth - (margin * 2);
    const bracketHeight = pageHeight - bracketTop - 70;
    const roundWidth = bracketWidth / numRounds;
    const matchupWidth = roundWidth - 15;
    
    // Calculate matchup height based on number of first round matchups
    const firstRoundCount = blankMatchups[0].length;
    const maxMatchupHeight = Math.min(36, (bracketHeight - 20) / firstRoundCount - 4);
    const matchupHeight = Math.max(24, maxMatchupHeight);
    const entryHeight = matchupHeight / 2;
    
    // Draw each round
    blankMatchups.forEach((round, roundIndex) => {
      const numMatchups = round.length;
      const roundX = margin + (roundIndex * roundWidth) + 5;
      
      // Round title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...mediumGray);
      const roundName = getRoundName(roundIndex, numRounds);
      pdf.text(roundName, roundX + matchupWidth / 2, bracketTop - 5, { align: 'center' });
      
      // Calculate total height needed for this round's matchups
      // Each subsequent round needs more spacing to align with previous round
      const firstRoundTotalHeight = firstRoundCount * (matchupHeight + 4);
      const thisRoundSpacing = firstRoundTotalHeight / numMatchups;
      
      round.forEach((match, matchIndex) => {
        // Center each matchup within its allocated space
        const slotTop = bracketTop + (matchIndex * thisRoundSpacing);
        const slotBottom = bracketTop + ((matchIndex + 1) * thisRoundSpacing);
        const matchY = slotTop + (thisRoundSpacing - matchupHeight) / 2;
        
        // Draw single outer matchup box
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(1);
        pdf.setFillColor(...white);
        pdf.rect(roundX, matchY, matchupWidth, matchupHeight, 'FD');
        
        // Draw divider line between entries (shortened to stay inside box)
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(0.5);
        pdf.line(roundX + 1, matchY + entryHeight, roundX + matchupWidth - 1, matchY + entryHeight);
        
        // Entry 1 content - only draw if has data
        if (match.entry1) {
          // Seed box
          pdf.setFillColor(...orange);
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.rect(roundX + 3, matchY + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(String(match.entry1.seed), roundX + 3 + seedSize / 2, matchY + entryHeight / 2 + 2, { align: 'center' });
          
          // Name
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(match.entry1.name.substring(0, 15), roundX + seedSize + 8, matchY + entryHeight / 2 + 2);
        }
        // Empty boxes for later rounds - no lines inside
        
        // Entry 2 content - only draw if has data
        if (match.entry2) {
          // Seed box
          pdf.setFillColor(...orange);
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.rect(roundX + 3, matchY + entryHeight + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(String(match.entry2.seed), roundX + 3 + seedSize / 2, matchY + entryHeight + entryHeight / 2 + 2, { align: 'center' });
          
          // Name
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(match.entry2.name.substring(0, 15), roundX + seedSize + 8, matchY + entryHeight + entryHeight / 2 + 2);
        }
        // Empty boxes for later rounds - no lines inside
        
        // Draw connector lines to next round
        if (roundIndex < numRounds - 1) {
          const matchCenterY = matchY + matchupHeight / 2;
          pdf.setDrawColor(...borderGray);
          pdf.setLineWidth(0.75);
          pdf.line(roundX + matchupWidth, matchCenterY, roundX + matchupWidth + 7, matchCenterY);
        }
      });
    });
    
    // Champion box at bottom
    const champY = pageHeight - 55;
    const champWidth = 180;
    const champX = (pageWidth - champWidth) / 2;
    
    pdf.setFillColor(...lightBg);
    pdf.rect(champX, champY, champWidth, 35, 'F');
    pdf.setDrawColor(...orange);
    pdf.setLineWidth(2);
    pdf.rect(champX, champY, champWidth, 35, 'S');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...mediumGray);
    pdf.text('CHAMPION', pageWidth / 2, champY + 12, { align: 'center' });
    
    // Blank line for champion name
    pdf.setDrawColor(...borderGray);
    pdf.setLineWidth(0.5);
    pdf.line(champX + 25, champY + 27, champX + champWidth - 25, champY + 27);
    
    pdf.save(`${bracket.title.replace(/\s+/g, '-')}-blank-bracket.pdf`);
  };
  
  return (
    <div className="fill-container">
      <div className="fill-header">
        <h1>{bracket.title}</h1>
        <p>Click on entries to select winners for each matchup</p>
        <p className="bracket-author-fill">Created by {bracket.userDisplayName}</p>
        <button className="download-blank-btn" onClick={downloadBlankBracket}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download Blank Bracket
        </button>
      </div>
      
      <div className="bracket-wrapper">
        {matchups.map((round, roundIndex) => (
          <div key={roundIndex} className="round">
            <div className="round-title">{getRoundName(roundIndex, matchups.length)}</div>
            <div className="matchups-container">
              {round.map((match, matchIndex) => (
                <div key={match.id} className="matchup">
                  <div className={`matchup-entry ${!match.entry1 ? 'empty' : ''} ${match.winner === 1 ? 'selected' : ''}`} onClick={() => match.entry1 && handleSelectWinner(roundIndex, matchIndex, 1)}>
                    {match.entry1 ? (<><span className="entry-seed-small">{match.entry1.seed}</span><span className="entry-name">{match.entry1.name}</span></>) : (<span className="entry-name tbd">TBD</span>)}
                  </div>
                  <div className={`matchup-entry ${!match.entry2 ? 'empty' : ''} ${match.winner === 2 ? 'selected' : ''}`} onClick={() => match.entry2 && handleSelectWinner(roundIndex, matchIndex, 2)}>
                    {match.entry2 ? (<><span className="entry-seed-small">{match.entry2.seed}</span><span className="entry-name">{match.entry2.name}</span></>) : (<span className="entry-name tbd">TBD</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {isComplete() && (
        <div className="champion-display">
          <div className="champion-label">🏆 CHAMPION 🏆</div>
          <div className="champion-name">{getChampion()?.name}</div>
        </div>
      )}
      
      <div className="submit-section">
        <button className="back-btn" onClick={onBack}>Cancel</button>
        <button className="submit-btn" disabled={!isComplete()} onClick={handleSubmit}>
          Submit Bracket →
        </button>
      </div>
    </div>
  );
};

// PDF Page Component
const PDFPage = ({ bracket, onBack }) => {
  const { currentUser } = useAuth();
  
  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'Finals';
    if (remaining === 2) return 'Semi-Finals';
    if (remaining === 3) return 'Quarter-Finals';
    return `Round ${roundIndex + 1}`;
  };
  
  const downloadPDF = async () => {
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    
    // Create landscape letter PDF
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Colors
    const orange = [255, 107, 53];
    const darkGray = [51, 51, 51];
    const mediumGray = [102, 102, 102];
    const borderGray = [180, 180, 180];
    const lightBg = [250, 250, 250];
    const winnerGreen = [212, 237, 218];
    const white = [255, 255, 255];
    
    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...darkGray);
    pdf.text(bracket.title, pageWidth / 2, 40, { align: 'center' });
    
    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...mediumGray);
    pdf.text(`${bracket.category} • ${bracket.size} Entries • Filled by ${currentUser?.displayName || 'Guest'}`, pageWidth / 2, 58, { align: 'center' });
    
    // Bracket dimensions
    const numRounds = bracket.matchups.length;
    const margin = 30;
    const bracketTop = 80;
    const bracketWidth = pageWidth - (margin * 2);
    const bracketHeight = pageHeight - bracketTop - 70;
    const roundWidth = bracketWidth / numRounds;
    const matchupWidth = roundWidth - 15;
    
    // Calculate matchup height based on number of first round matchups
    const firstRoundCount = bracket.matchups[0].length;
    const maxMatchupHeight = Math.min(36, (bracketHeight - 20) / firstRoundCount - 4);
    const matchupHeight = Math.max(24, maxMatchupHeight);
    const entryHeight = matchupHeight / 2;
    
    // Draw each round
    bracket.matchups.forEach((round, roundIndex) => {
      const numMatchups = round.length;
      const roundX = margin + (roundIndex * roundWidth) + 5;
      
      // Round title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...mediumGray);
      pdf.text(getRoundName(roundIndex, numRounds), roundX + matchupWidth / 2, bracketTop - 5, { align: 'center' });
      
      // Calculate total height needed for this round's matchups
      const firstRoundTotalHeight = firstRoundCount * (matchupHeight + 4);
      const thisRoundSpacing = firstRoundTotalHeight / numMatchups;
      
      round.forEach((match, matchIndex) => {
        // Center each matchup within its allocated space
        const slotTop = bracketTop + (matchIndex * thisRoundSpacing);
        const matchY = slotTop + (thisRoundSpacing - matchupHeight) / 2;
        
        // Draw single outer matchup box first
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(1);
        pdf.setFillColor(...white);
        pdf.rect(roundX, matchY, matchupWidth, matchupHeight, 'FD');
        
        // Fill entry backgrounds
        const isWinner1 = match.winner === 1;
        const isWinner2 = match.winner === 2;
        
        if (isWinner1) {
          pdf.setFillColor(...winnerGreen);
          pdf.rect(roundX + 1, matchY + 1, matchupWidth - 2, entryHeight - 1, 'F');
        }
        
        if (isWinner2) {
          pdf.setFillColor(...winnerGreen);
          pdf.rect(roundX + 1, matchY + entryHeight + 1, matchupWidth - 2, entryHeight - 2, 'F');
        }
        
        // Draw divider line between entries (shortened to stay inside box)
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(0.5);
        pdf.line(roundX + 1, matchY + entryHeight, roundX + matchupWidth - 1, matchY + entryHeight);
        
        // Entry 1 content
        if (match.entry1) {
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.setFillColor(...orange);
          pdf.rect(roundX + 3, matchY + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(String(match.entry1.seed), roundX + 3 + seedSize / 2, matchY + entryHeight / 2 + 2, { align: 'center' });
          
          pdf.setFont('helvetica', isWinner1 ? 'bold' : 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(match.entry1.name.substring(0, 15), roundX + seedSize + 8, matchY + entryHeight / 2 + 2);
        } else {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...borderGray);
          pdf.text('TBD', roundX + 8, matchY + entryHeight / 2 + 2);
        }
        
        // Entry 2 content
        if (match.entry2) {
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.setFillColor(...orange);
          pdf.rect(roundX + 3, matchY + entryHeight + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(String(match.entry2.seed), roundX + 3 + seedSize / 2, matchY + entryHeight + entryHeight / 2 + 2, { align: 'center' });
          
          pdf.setFont('helvetica', isWinner2 ? 'bold' : 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(match.entry2.name.substring(0, 15), roundX + seedSize + 8, matchY + entryHeight + entryHeight / 2 + 2);
        } else {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...borderGray);
          pdf.text('TBD', roundX + 6, matchY + entryHeight + entryHeight / 2 + 2);
        }
        
        // Draw connector lines to next round
        if (roundIndex < numRounds - 1) {
          const matchCenterY = matchY + matchupHeight / 2;
          pdf.setDrawColor(...borderGray);
          pdf.setLineWidth(0.75);
          pdf.line(roundX + matchupWidth, matchCenterY, roundX + matchupWidth + 7, matchCenterY);
        }
      });
    });
    
    // Champion box at bottom
    if (bracket.champion) {
      const champY = pageHeight - 55;
      const champWidth = 180;
      const champX = (pageWidth - champWidth) / 2;
      
      pdf.setFillColor(255, 243, 205);
      pdf.rect(champX, champY, champWidth, 35, 'F');
      pdf.setDrawColor(...orange);
      pdf.setLineWidth(2);
      pdf.rect(champX, champY, champWidth, 35, 'S');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...mediumGray);
      pdf.text('CHAMPION', pageWidth / 2, champY + 12, { align: 'center' });
      
      pdf.setFontSize(14);
      pdf.setTextColor(...darkGray);
      pdf.text(bracket.champion.name, pageWidth / 2, champY + 28, { align: 'center' });
    }
    
    pdf.save(`${bracket.title.replace(/\s+/g, '-')}-bracket.pdf`);
  };
  
  return (
    <div className="pdf-container">
      <div className="pdf-header">
        <h1>Your Bracket is Ready!</h1>
        <p>Download your completed bracket as a PDF</p>
      </div>
      
      <div className="pdf-preview-display">
        <h2 className="preview-title">{bracket.title}</h2>
        <p className="preview-subtitle">{bracket.category} • {bracket.size} Entries</p>
        
        <div className="preview-bracket">
          {bracket.matchups.map((round, roundIndex) => (
            <div key={roundIndex} className="preview-round">
              <div className="preview-round-title">{getRoundName(roundIndex, bracket.matchups.length)}</div>
              <div className="preview-matchups">
                {round.map((match) => (
                  <div key={match.id} className="preview-matchup">
                    <div className={`preview-entry ${match.winner === 1 ? 'winner' : ''}`}>
                      {match.entry1 ? (<><span className="preview-seed">{match.entry1.seed}</span><span>{match.entry1.name}</span></>) : <span className="tbd">TBD</span>}
                    </div>
                    <div className={`preview-entry ${match.winner === 2 ? 'winner' : ''}`}>
                      {match.entry2 ? (<><span className="preview-seed">{match.entry2.seed}</span><span>{match.entry2.name}</span></>) : <span className="tbd">TBD</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {bracket.champion && (
          <div className="preview-champion">
            <span>🏆 CHAMPION: </span>
            <strong>{bracket.champion.name}</strong>
          </div>
        )}
      </div>
      
      <div className="pdf-actions">
        <button className="back-btn" onClick={onBack}>Back to Brackets</button>
        <button className="download-btn" onClick={downloadPDF}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download PDF
        </button>
      </div>
    </div>
  );
};

// Main App Component
function AppContent() {
  const [view, setView] = useState('home');
  const [currentBracket, setCurrentBracket] = useState(null);
  const [fillingBracket, setFillingBracket] = useState(null);
  
  const handleFillOut = (bracket) => {
    setFillingBracket({ ...bracket, matchups: bracket.matchups.map(round => round.map(match => ({ ...match }))) });
    setView('fill');
  };
  
  const handleSubmitFilled = (filledBracket) => {
    setCurrentBracket(filledBracket);
    setView('pdf');
  };

  return (
    <div className="bracket-app">
      <Header onNavigate={setView} currentView={view} />
      
      {view === 'home' && <HomePage onFillOut={handleFillOut} onNavigate={setView} />}
      {view === 'my-brackets' && <MyBracketsPage onFillOut={handleFillOut} onNavigate={setView} />}
      {view === 'create' && <CreatePage onNavigate={setView} />}
      {view === 'fill' && fillingBracket && <FillPage bracket={fillingBracket} onSubmit={handleSubmitFilled} onBack={() => setView('home')} />}
      {view === 'pdf' && currentBracket && <PDFPage bracket={currentBracket} onBack={() => setView('home')} />}
      {view === 'weekly' && <WeeklyBracketPage />}
      {view === 'admin' && <AdminPage />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
