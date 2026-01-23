// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
  createBracket, 
  getAllBrackets, 
  getUserBrackets,
  deleteBracket,
  submitFilledBracket 
} from './services/bracketService';
import './App.css';

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

  const openAuth = (mode) => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <>
      <header className="header">
        <div className="logo" onClick={() => onNavigate('home')}>I'M TOURN</div>
        
        <div className="header-actions">
          {currentView === 'home' && currentUser && (
            <button className="nav-btn" onClick={() => onNavigate('create')}>
              + Create Bracket
            </button>
          )}
          
          {currentView !== 'home' && (
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
      ) : (
        <div className="brackets-grid">
          {brackets.map(bracket => (
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
  
  return (
    <div className="fill-container">
      <div className="fill-header">
        <h1>{bracket.title}</h1>
        <p>Click on entries to select winners for each matchup</p>
        <p className="bracket-author-fill">Created by {bracket.userDisplayName}</p>
      </div>
      
      <div className="bracket-wrapper">
        {matchups.map((round, roundIndex) => (
          <div key={roundIndex} className="round">
            <div className="round-title">{getRoundName(roundIndex, matchups.length)}</div>
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
  const pdfRef = useRef(null);
  const { currentUser } = useAuth();
  
  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'Finals';
    if (remaining === 2) return 'Semi-Finals';
    if (remaining === 3) return 'Quarter-Finals';
    return `Round ${roundIndex + 1}`;
  };
  
  const downloadPDF = async () => {
    const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    
    const element = pdfRef.current;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${bracket.title.replace(/\s+/g, '-')}-bracket.pdf`);
  };
  
  return (
    <div className="pdf-container">
      <div className="pdf-header">
        <h1>Your Bracket is Ready!</h1>
        <p>Download your completed bracket as a PDF</p>
      </div>
      
      <div className="pdf-preview" ref={pdfRef}>
        <h1 className="pdf-title">{bracket.title}</h1>
        <p className="pdf-subtitle">{bracket.category} • {bracket.size} Entries • Filled by {currentUser?.displayName || 'Guest'}</p>
        
        <div className="pdf-bracket">
          {bracket.matchups.map((round, roundIndex) => (
            <div key={roundIndex} className="pdf-round">
              <div className="pdf-round-title">{getRoundName(roundIndex, bracket.matchups.length)}</div>
              {round.map((match) => (
                <div key={match.id} className="pdf-matchup">
                  <div className={`pdf-entry ${match.winner === 1 ? 'winner' : ''}`}>
                    {match.entry1 ? (<><span className="pdf-seed">{match.entry1.seed}</span><span className="pdf-name">{match.entry1.name}</span></>) : <span className="pdf-name">TBD</span>}
                  </div>
                  <div className={`pdf-entry ${match.winner === 2 ? 'winner' : ''}`}>
                    {match.entry2 ? (<><span className="pdf-seed">{match.entry2.seed}</span><span className="pdf-name">{match.entry2.name}</span></>) : <span className="pdf-name">TBD</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        
        {bracket.champion && (
          <div className="pdf-champion">
            <div className="pdf-champion-label">🏆 CHAMPION 🏆</div>
            <div className="pdf-champion-name">{bracket.champion.name}</div>
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
