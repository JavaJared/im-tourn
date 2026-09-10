import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { RankingCard, pickFeaturedRanking, FeaturedRankingCard } from './shared';

export const RankingsBrowsePage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const catalog = usePagedCatalog(['ranking']);
  const rankings = catalog.items, loading = catalog.loading && !rankings.length;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | popular

  const categories = [...new Set(rankings.map(r => r.category).filter(Boolean))].sort();

  // Today's featured ranking — picked from the full list (search/filters
  // deliberately don't affect it) and recomputed only when the list loads.
  const featured = pickFeaturedRanking(rankings);

  const filtered = rankings
    .filter(r => {
      const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || r.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const voteCmp = (b.voteCount || 0) - (a.voteCount || 0);
        if (voteCmp !== 0) return voteCmp;
      }
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt) - new Date(a.createdAt);
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
        <h1>RANK <span>ANYTHING</span></h1>
        <p>Create a list, let the crowd sort it head-to-head, and discover the consensus.</p>
        {!currentUser && (
          <p className="hero-cta">Sign up to create and vote on rankings!</p>
        )}
      </div>

      {!loading && featured && (
        <>
          <div className="section-title">FEATURED TODAY</div>
          <FeaturedRankingCard
            ranking={featured}
            onClick={() => onNavigate(`ranking-${featured.id}`)}
          />
        </>
      )}

      <div className="section-title">BROWSE RANKINGS</div>

      <div className="filter-bar">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search rankings..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {categories.length > 0 && (
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        <div className="ranking-sort-toggle">
          <button
            className={sortBy === 'newest' ? 'active' : ''}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </button>
          <button
            className={sortBy === 'popular' ? 'active' : ''}
            onClick={() => setSortBy('popular')}
          >
            Popular
          </button>
        </div>

        {hasActiveFilters && (
          <button className="clear-filters-btn" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {currentUser && (
        <div className="ranking-browse-actions">
          <button className="nav-btn" onClick={() => onNavigate('create-ranking')}>
            + Create Ranking
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading rankings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {rankings.length === 0 ? (
            <>
              <p>No rankings yet. Be the first to create one!</p>
              {currentUser && (
                <button className="nav-btn" onClick={() => onNavigate('create-ranking')} style={{ marginTop: '1rem' }}>
                  Create the First Ranking
                </button>
              )}
            </>
          ) : (
            <p>No rankings match your filters.</p>
          )}
        </div>
      ) : (
        <div className="ranking-browse-grid">
          {filtered.map(r => (
            <RankingCard
              key={r.id}
              ranking={r}
              onClick={() => onNavigate(`ranking-${r.id}`)}
            />
          ))}
        </div>
      )}
      <CatalogControls catalog={catalog} />
    </div>
  );
};
