

const RankingCard = ({ ranking, onClick }) => {
  const isClosed = ranking.status === 'closed';
  return (
    <div className="ranking-browse-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); } }}>
      {isClosed && <span className="ranking-card-closed-badge">Closed</span>}
      {ranking.category && <span className="ranking-card-category">{ranking.category}</span>}
      <h3 className="ranking-card-title">{ranking.title}</h3>
      {ranking.description && (
        <p className="ranking-card-description">{ranking.description}</p>
      )}
      <div className="ranking-card-meta">
        <span className="ranking-card-stats">
          {ranking.entryCount} entries · {ranking.voteCount || 0} {(ranking.voteCount === 1) ? 'vote' : 'votes'}
        </span>
        <span className="ranking-card-host">by {ranking.hostDisplayName}</span>
      </div>
    </div>
  );
};

const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

const todayKeyET = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const pickFeaturedRanking = (rankings, dateKey = todayKeyET()) => {
  if (!rankings || rankings.length === 0) return null;
  const open = rankings.filter((r) => r.status !== 'closed');
  const candidates = open.length > 0 ? open : rankings;
  let best = null, bestHash = -1;
  for (const r of candidates) {
    const h = fnv1a(`${dateKey}:${r.id}`);
    if (h > bestHash) { bestHash = h; best = r; }
  }
  return best;
};

const FeaturedRankingCard = ({ ranking, onClick }) => (
  <div className="featured-ranking-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); } }}>
    <div className="featured-ranking-badge">★ Featured today</div>
    <div className="featured-ranking-body">
      {ranking.category && <span className="ranking-card-category">{ranking.category}</span>}
      <h3 className="featured-ranking-title">{ranking.title}</h3>
      {ranking.description && (
        <p className="ranking-card-description">{ranking.description}</p>
      )}
      <div className="ranking-card-meta">
        <span className="ranking-card-stats">
          {ranking.entryCount} entries · {ranking.voteCount || 0} {(ranking.voteCount === 1) ? 'vote' : 'votes'}
        </span>
        <span className="ranking-card-host">by {ranking.hostDisplayName}</span>
      </div>
    </div>
    <span className="featured-ranking-cta">{ranking.status === 'closed' ? 'See results →' : 'Vote now →'}</span>
  </div>
);

export { RankingCard, fnv1a, todayKeyET, pickFeaturedRanking, FeaturedRankingCard };
