const keyOf = item => `${item.type}:${item.id}`;
function rankFeed(items, {uid, friends = new Set(), categories = {}, completed = new Set(), hidden = new Set(), opened = new Set()} = {}, now = Date.now()) {
  const remaining = items.filter(item => !hidden.has(keyOf(item))).map(item => {
    const category = String(item.category || 'Other').toLowerCase();
    const interest = Number.isFinite(categories[category]) ? categories[category] : 0;
    const friend = friends.has(item.userId || item.hostId);
    const done = completed.has(keyOf(item));
    const age = Math.max(0, now - (item.createdAtMs || 0)) / 86400000;
    const score = 12 / (1 + age / 7) + Math.max(-12, Math.min(12, interest * 2)) + (friend ? 8 : 0)
      - (done ? 24 : 0) - (opened.has(keyOf(item)) ? 3 : 0) - (uid && (item.userId || item.hostId) === uid ? 12 : 0);
    return {...item, completed:done, reason:friend ? 'From a friend' : interest > 0 ? `More in ${item.category}` : 'Discover something new', score};
  });
  const result = [], authors = new Map();
  while (remaining.length) {
    const adjusted = item => item.score - (authors.get(item.userId || item.hostId) || 0) * 7
      - (result.length >= 2 && result.slice(-2).every(previous => (previous.type === 'ranking') === (item.type === 'ranking')) ? 6 : 0);
    remaining.sort((a,b) => adjusted(b)-adjusted(a) || b.createdAtMs-a.createdAtMs || keyOf(a).localeCompare(keyOf(b)));
    const {score,...item} = remaining.shift();
    result.push(item);const author = item.userId || item.hostId;authors.set(author,(authors.get(author)||0)+1);
  }
  return result;
}
module.exports = {rankFeed,keyOf};
