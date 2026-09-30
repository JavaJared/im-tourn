function createHandler({ db, stamp, hash, HttpsError, generateSeededBracket, serialize }) {
  const validId = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
  const fail = message => { throw new HttpsError('failed-precondition', message); };
  return async req => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to create a bracket.');
    const uid = req.auth.uid;
    const { rankingId, mode, requestId } = req.data || {};
    if (!validId(rankingId) || !validId(requestId) || !['personal', 'consensus'].includes(mode)) {
      throw new HttpsError('invalid-argument', 'Choose a saved ranking.');
    }
    // The caller cannot supply someone else's user ID, ordering, or participants.
    const target = db.doc('customBrackets/ranking-' + hash(uid + ':' + rankingId + ':' + mode + ':' + requestId));
    return db.runTransaction(async tx => {
      const sourceRef = db.doc('rankings/' + rankingId);
      const sourceDoc = await tx.get(sourceRef);
      const source = sourceDoc.data();
      if (!source || !['open', 'closed'].includes(source.status)) fail('This ranking is unavailable.');
      if (mode === 'consensus' && source.hostId !== uid) {
        throw new HttpsError('permission-denied', 'Only the ranking creator can convert its consensus.');
      }
      const existing = await tx.get(target);
      if (existing.exists) {
        if (existing.data().hostId !== uid) throw new HttpsError('permission-denied', 'This bracket is unavailable.');
        return { bracketId: target.id };
      }
      const entryDocs = await tx.get(db.collection('rankingEntries').where('rankingId', '==', rankingId).limit(101));
      const entries = entryDocs.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      if (entries.length < 2 || entries.length > 100 || entries.length !== source.entryCount ||
          entries.some(entry => typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 500)) {
        fail('This ranking has missing or invalid entries.');
      }
      let order;
      if (mode === 'personal') {
        const vote = (await tx.get(db.doc('rankingVotes/' + rankingId + '_' + uid))).data();
        if (!vote || vote.userId !== uid || vote.rankingId !== rankingId) fail('Submit your personal ranking first.');
        order = parse(vote.ranking);
      } else {
        const consensus = parse(source.consensusRanking);
        if (!(source.voteCount > 0) || !Array.isArray(consensus) ||
            consensus.some(item => !item || typeof item.id !== 'string' || !Number.isFinite(item.score))) {
          fail('There is no complete consensus to convert yet.');
        }
        // Stable sorting preserves the displayed consensus order when scores tie.
        order = [...consensus].sort((a, b) => b.score - a.score).map(item => item.id);
      }
      const byId = new Map(entries.map(entry => [entry.id, entry]));
      if (!Array.isArray(order) || order.length !== entries.length || new Set(order).size !== entries.length ||
          order.some(id => !byId.has(id))) fail('The saved ranking no longer matches this set. Submit it again.');
      const limitRef = db.doc('socialWriteLimits/' + uid + '-ranking-brackets');
      const budget = (await tx.get(limitRef)).data(), day = Math.floor(Date.now() / 86400000);
      const used = budget?.day === day && Number.isSafeInteger(budget.count) ? Math.max(0, budget.count) : 0;
      if (used >= 20) throw new HttpsError('resource-exhausted', 'You can convert up to 20 rankings per day.');
      const state = generateSeededBracket(order.map(id => byId.get(id).text.trim()));
      const title = (typeof source.title === 'string' ? source.title : 'Ranking') + (mode === 'consensus' ? ' — Consensus bracket' : ' — My bracket');
      tx.set(target, {
        ...serialize(state), title: title.slice(0, 200), hostId: uid, hostName: null,
        description: 'From ranking: https://imtourn.com/?view=ranking-' + encodeURIComponent(rankingId),
        category: typeof source.category === 'string' ? source.category : null,
        status: 'draft', type: 'custom', scoring: { byTier: {} },
        createdAt: stamp(), updatedAt: stamp(),
      });
      tx.set(limitRef, { day, count: used + 1 });
      return { bracketId: target.id };
    });
  };
}
module.exports = { createHandler };
