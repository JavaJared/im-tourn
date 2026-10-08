const { HttpsError } = require('firebase-functions/v2/https');
const { canonical, nextEasternMidnight, SCHEDULE_VERSION } = require('./arena-core');
const fail = (code, message) => { throw new HttpsError(code, message); };
const admin = req => !!req.auth && (req.auth.token?.admin === true || req.auth.uid === 'VBbDwj6gkVgW7gBcs3vTmt0ulLF2');
function requireAdmin(req) { if (!admin(req)) fail('permission-denied', 'Administrator access required.'); }
function uid(req) { if (!req.auth) fail('unauthenticated', 'Sign in to participate.'); return req.auth.uid; }
function id(value) { if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) fail('invalid-argument', 'Invalid identifier.'); return value; }
function text(value, max) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail('invalid-argument', `Enter between 1 and ${max} characters.`); return value.trim(); }
function debateInput(data, minimum = 4) {
  const title = text(data.title, 100);
  if (!Array.isArray(data.candidates) || data.candidates.length < minimum || data.candidates.length > 50) fail('invalid-argument', `Supply ${minimum}–50 unique challengers, with the opening pair first.`);
  const candidates = data.candidates.map((value, i) => {
    const name = text(text(value, 80).normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' '), 80);
    return { id: `c${i + 1}`, name };
  });
  if (new Set(candidates.map(c => canonical(c.name))).size !== candidates.length) fail('invalid-argument', 'Challenger names must be unique.');
  return { title, candidates };
}
function newRoom(input, creatorId, now) {
  return { ...input, creatorId, createdAt: now, round: 1, matchup: ['c1', 'c2'], defender: null, chairEpoch: 0, lossEpoch: {}, votes: {}, nominations: {}, stats: {}, lastPlayed: { c1: 1, c2: 1 }, status: 'active', endAt: nextEasternMidnight(now), scheduleVersion: SCHEDULE_VERSION, pauseReason: '' };
}
module.exports = { fail, admin, requireAdmin, uid, id, text, debateInput, newRoom };
