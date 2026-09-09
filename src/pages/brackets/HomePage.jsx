import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllBrackets } from '../../services/bracketService';
import { getPublicCustomBrackets } from '../../services/customBracketService';
import { CUSTOM_BADGE_STYLE } from '../../components/brackets/customBracketPresentation.js';
import SubmissionsModal from '../../components/dialogs/SubmissionsModal.jsx';

const HomePage = ({ onFillOut, onNavigate }) => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [selectedBracketForSubmissions, setSelectedBracketForSubmissions] = useState(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    loadBrackets();
  }, []);

  const loadBrackets = async () => {
    try {
      const [data, customData] = await Promise.all([getAllBrackets(), getPublicCustomBrackets()]);
      setBrackets([...data, ...customData]);
    } catch (error) {
      console.error('Error loading brackets:', error);
    }
    setLoading(false);
  };

  // Get unique categories from brackets
  const categories = [...new Set(brackets.map((b) => b.category))].sort();

  // Filter and sort brackets
  const filteredBrackets = brackets
    .filter((bracket) => {
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
        <h1>
          CREATE YOUR <span>ULTIMATE</span> BRACKET
        </h1>
        <p>
          Design custom tournament brackets for anything—movies, shows, teams, and more. Share them
          with friends and settle the debate once and for all.
        </p>
        {!currentUser && <p className="hero-cta">Sign up to create and share your own brackets!</p>}
      </div>

      <div className="section-title">BROWSE BRACKETS</div>

      {/* Search and Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search brackets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>
              ×
            </button>
          )}
        </div>

        <div className="filter-controls">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
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
            <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p>No brackets yet. Be the first to create one!</p>
        </div>
      ) : filteredBrackets.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p>No brackets match your search.</p>
          <button
            className="clear-filters-btn"
            onClick={clearFilters}
            style={{ marginTop: '1rem' }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="brackets-grid">
          {filteredBrackets.map((bracket) =>
            bracket.isCustom ? (
              <div
                key={bracket.id}
                className="bracket-card"
                onClick={() => onNavigate(`custom-bracket-${bracket.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <span className="bracket-category">{bracket.category}</span>
                {bracket.origin !== 'standard' && <span style={CUSTOM_BADGE_STYLE}>Custom</span>}
                <h3 className="bracket-title">{bracket.title}</h3>
                {bracket.description && (
                  <p className="bracket-description">{bracket.description}</p>
                )}
                <div className="bracket-meta">
                  <div className="bracket-info">
                    <span className="bracket-size">
                      <span>{bracket.size}</span> players
                    </span>
                    <span className="bracket-author">by {bracket.userDisplayName}</span>
                  </div>
                  <div className="bracket-buttons">
                    <button
                      className="fill-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(`custom-bracket-${bracket.id}`);
                      }}
                    >
                      View →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={bracket.id} className="bracket-card">
                <span className="bracket-category">{bracket.category}</span>
                <h3 className="bracket-title">{bracket.title}</h3>
                {bracket.description && (
                  <p className="bracket-description">{bracket.description}</p>
                )}
                <div className="bracket-meta">
                  <div className="bracket-info">
                    <span className="bracket-size">
                      <span>{bracket.size}</span> entries
                    </span>
                    <span className="bracket-author">by {bracket.userDisplayName}</span>
                  </div>
                  <div className="bracket-buttons">
                    <button
                      className="view-submissions-btn"
                      onClick={() => {
                        setSelectedBracketForSubmissions(bracket);
                        setShowSubmissionsModal(true);
                      }}
                    >
                      Submissions
                    </button>
                    <button className="fill-btn" onClick={() => onFillOut(bracket)}>
                      Fill Out →
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <SubmissionsModal
        isOpen={showSubmissionsModal}
        onClose={() => {
          setShowSubmissionsModal(false);
          setSelectedBracketForSubmissions(null);
        }}
        bracket={selectedBracketForSubmissions}
      />
    </div>
  );
};

export default HomePage;
