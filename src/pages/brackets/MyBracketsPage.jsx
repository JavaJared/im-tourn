import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserBrackets, deleteBracket } from '../../services/bracketService';
import {
  getUserCustomBrackets,
  deleteBracket as deleteCustomBracket,
} from '../../services/customBracketService';
import {
  CUSTOM_STATUS_LABEL,
  CUSTOM_BADGE_STYLE,
} from '../../components/brackets/customBracketPresentation.js';

const MyBracketsPage = ({ onFillOut, onNavigate }) => {
  const [brackets, setBrackets] = useState([]);
  const [customBrackets, setCustomBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadUserBrackets();
    }
  }, [currentUser]);

  const loadUserBrackets = async () => {
    try {
      const [data, customData] = await Promise.all([
        getUserBrackets(currentUser.uid),
        getUserCustomBrackets(currentUser.uid),
      ]);
      setBrackets(data);
      setCustomBrackets(customData);
    } catch (error) {
      console.error('Error loading brackets:', error);
    }
    setLoading(false);
  };

  const handleDeleteCustom = async (id) => {
    if (window.confirm('Delete this custom bracket?')) {
      try {
        await deleteCustomBracket(id);
        setCustomBrackets(customBrackets.filter((b) => b.id !== id));
      } catch (error) {
        console.error('Error deleting custom bracket:', error);
      }
    }
  };

  const handleDelete = async (bracketId) => {
    if (window.confirm('Are you sure you want to delete this bracket?')) {
      try {
        await deleteBracket(bracketId);
        setBrackets(brackets.filter((b) => b.id !== bracketId));
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
      ) : brackets.length === 0 && customBrackets.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p>You haven't created any brackets yet.</p>
          <button
            className="nav-btn"
            onClick={() => onNavigate('create')}
            style={{ marginTop: '1rem' }}
          >
            Create Your First Bracket
          </button>
        </div>
      ) : (
        <div className="brackets-grid">
          {brackets.map((bracket) => (
            <div key={bracket.id} className="bracket-card">
              <span className="bracket-category">{bracket.category}</span>
              <h3 className="bracket-title">{bracket.title}</h3>
              {bracket.description && <p className="bracket-description">{bracket.description}</p>}
              <div className="bracket-meta">
                <span className="bracket-size">
                  <span>{bracket.size}</span> entries • {bracket.createdAt}
                </span>
                <div className="bracket-actions">
                  <button className="fill-btn" onClick={() => onFillOut(bracket)}>
                    Fill Out
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(bracket.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {customBrackets.map((cb) => (
            <div
              key={cb.id}
              className="bracket-card"
              onClick={() => onNavigate(`custom-bracket-${cb.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <span className="bracket-category">{cb.category}</span>
              {cb.origin !== 'standard' && <span style={CUSTOM_BADGE_STYLE}>Custom</span>}
              <h3 className="bracket-title">{cb.title}</h3>
              {cb.description && <p className="bracket-description">{cb.description}</p>}
              <div className="bracket-meta">
                <span className="bracket-size">
                  <span>{cb.size}</span> players • {CUSTOM_STATUS_LABEL[cb.status]}
                </span>
                <div className="bracket-actions">
                  <button
                    className="fill-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(`custom-bracket-${cb.id}`);
                    }}
                  >
                    Open
                  </button>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCustom(cb.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyBracketsPage;
