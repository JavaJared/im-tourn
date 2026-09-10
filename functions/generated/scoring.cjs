var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/serverScoring.js
var serverScoring_exports = {};
__export(serverScoring_exports, {
  adaptLegacyEntry: () => adaptLegacyEntry,
  adaptLegacyPool: () => adaptLegacyPool,
  applyPicks: () => applyPicks,
  blankPrediction: () => blankPrediction,
  buildLeaderboard: () => buildLeaderboard,
  computeConsensus: () => computeConsensus,
  dateKeyET: () => dateKeyET,
  defaultRoundPoints: () => defaultRoundPoints,
  getChampion: () => getChampion,
  gradeSleepers: () => gradeSleepers,
  hydrateState: () => hydrateState,
  isEntryComplete: () => isEntryComplete,
  isLegacyEntry: () => isLegacyEntry,
  isLegacyPool: () => isLegacyPool,
  legacyResultsToMap: () => legacyResultsToMap,
  normalizeSleeper: () => normalizeSleeper,
  participantsInRound: () => participantsInRound,
  picksFromState: () => picksFromState,
  predictedLosers: () => predictedLosers,
  scoreEntry: () => scoreEntry,
  setResult: () => setResult,
  standardWeeklyMatchups: () => standardWeeklyMatchups,
  validateLegacyMatchups: () => validateLegacyMatchups,
  validateStructure: () => validateStructure,
  weekKey: () => weekKey,
  weeklyVotingOpen: () => weeklyVotingOpen
});
module.exports = __toCommonJS(serverScoring_exports);

// src/lib/customBracket.js
var SLOT = Object.freeze({ OPEN: "open", NAMED: "named", BYE: "bye", FEED: "feed" });
var clone = (s) => typeof structuredClone === "function" ? structuredClone(s) : JSON.parse(JSON.stringify(s));
var storedSlot = (box, slot) => slot === "A" ? box.slotA : box.slotB;
function newId(s) {
  const id = `m${s._nextId}`;
  s._nextId += 1;
  return id;
}
function blankBox(id) {
  return { id, slotA: { type: SLOT.OPEN }, slotB: { type: SLOT.OPEN }, result: null, score: null };
}
function createBracket() {
  return { rounds: [], boxes: {}, _nextId: 1, _lastCreated: [] };
}
function locate(state) {
  const map = {};
  state.rounds.forEach((rd, r) => rd.forEach((id, p) => {
    map[id] = { r, p };
  }));
  return map;
}
function feederId(state, r, p, which) {
  if (r <= 0) return null;
  const prev = state.rounds[r - 1];
  const idx = 2 * p + which;
  return prev && idx < prev.length ? prev[idx] : null;
}
function slotDisplay(state, loc, boxId, slot) {
  const { r, p } = loc[boxId];
  const fid = feederId(state, r, p, slot === "A" ? 0 : 1);
  if (fid) return { type: SLOT.FEED, sourceBoxId: fid };
  return storedSlot(state.boxes[boxId], slot);
}
function addAt(state, r, pos) {
  const next = clone(state);
  if (r > next.rounds.length) throw new Error("Cannot skip a round");
  if (r === next.rounds.length) next.rounds.push([]);
  const id = newId(next);
  next.boxes[id] = blankBox(id);
  const round = next.rounds[r];
  const at = pos == null ? round.length : Math.max(0, Math.min(pos, round.length));
  round.splice(at, 0, id);
  next._lastCreated = [id];
  return next;
}
function addFirst(state) {
  return addAt(state, 0, null);
}
function beside(state, boxId) {
  const l = locate(state)[boxId];
  return addAt(state, l.r, l.p + 1);
}
function after(state, boxId) {
  const l = locate(state)[boxId];
  return addAt(state, l.r + 1, null);
}
function resolveParticipant(state, loc, boxId, slot) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return d.participantId;
  if (d.type === SLOT.BYE) return null;
  if (d.type === SLOT.OPEN) return void 0;
  return matchWinner(state, loc, d.sourceBoxId);
}
function matchWinner(state, loc, boxId) {
  const box = state.boxes[boxId];
  if (box.result) return box.result.winnerId;
  const a = resolveParticipant(state, loc, boxId, "A");
  const b = resolveParticipant(state, loc, boxId, "B");
  if (slotDisplay(state, loc, boxId, "A").type === SLOT.BYE && b != null) return b;
  if (slotDisplay(state, loc, boxId, "B").type === SLOT.BYE && a != null) return a;
  return void 0;
}
function parentId(state, loc, boxId) {
  const { r, p } = loc[boxId];
  const round = state.rounds[r + 1];
  const pp = Math.floor(p / 2);
  return round && pp < round.length ? round[pp] : null;
}
function clearResultsDownstream(state, loc, boxId) {
  let cur = parentId(state, loc, boxId);
  while (cur) {
    state.boxes[cur].result = null;
    cur = parentId(state, loc, cur);
  }
}
function setResult(state, boxId, winnerId) {
  const next = clone(state);
  const loc = locate(next);
  if (slotDisplay(next, loc, boxId, "A").type === SLOT.BYE || slotDisplay(next, loc, boxId, "B").type === SLOT.BYE) throw new Error("This matchup auto-advances past a bye");
  const a = resolveParticipant(next, loc, boxId, "A");
  const b = resolveParticipant(next, loc, boxId, "B");
  if (a === void 0 || b === void 0) throw new Error("Both participants must be decided first");
  if (winnerId !== a && winnerId !== b) throw new Error("Winner must be one of the two participants");
  const box = next.boxes[boxId];
  if (box.result && box.result.winnerId === winnerId) box.result = null;
  else box.result = { winnerId };
  clearResultsDownstream(next, loc, boxId);
  return next;
}
function getChampion(state) {
  if (!state.rounds.length) return null;
  const finalRound = state.rounds[state.rounds.length - 1];
  if (finalRound.length !== 1) return null;
  return matchWinner(state, locate(state), finalRound[0]) ?? null;
}

// src/lib/customScoring.js
function defaultRoundPoints(roundCount) {
  return Array.from({ length: Math.max(0, roundCount) }, (_, i) => i + 1);
}
var pointsForRound = (roundPoints, r) => roundPoints && roundPoints[r] != null ? roundPoints[r] : r + 1;
function picksFromState(state) {
  const picks = {};
  for (const id of Object.keys(state.boxes)) {
    const res = state.boxes[id].result;
    if (res && res.winnerId != null) picks[id] = res.winnerId;
  }
  return picks;
}
function isEntryComplete(state) {
  if (!state || !state.rounds || !state.boxes) return false;
  const loc = locate(state);
  for (const id of Object.keys(state.boxes)) {
    const aPlayer = slotDisplay(state, loc, id, "A").type !== SLOT.BYE && resolveParticipant(state, loc, id, "A") != null;
    const bPlayer = slotDisplay(state, loc, id, "B").type !== SLOT.BYE && resolveParticipant(state, loc, id, "B") != null;
    if (aPlayer && bPlayer && !state.boxes[id].result) return false;
  }
  return true;
}
function scoreEntry(bracketState, picks, roundPoints) {
  const loc = locate(bracketState);
  let total = 0, correct = 0;
  const correctByRound = {};
  for (const id of Object.keys(bracketState.boxes)) {
    const official = matchWinner(bracketState, loc, id);
    if (official == null) continue;
    const pick = picks ? picks[id] : null;
    if (pick == null) continue;
    if (pick === official) {
      const r = loc[id].r;
      total += pointsForRound(roundPoints, r);
      correct += 1;
      correctByRound[r] = (correctByRound[r] || 0) + 1;
    }
  }
  return { total, correct, correctByRound };
}
function buildLeaderboard(bracketState, entries, roundPoints, pool = null) {
  return entries.map((e) => {
    const base = scoreEntry(bracketState, e.picks || {}, roundPoints);
    const s = gradeSleepers(bracketState, e, pool);
    return { ...e, ...base, ...s, total: base.total + s.sleeperBonus };
  }).sort((a, b) => b.total - a.total || b.correct - a.correct || String(a.displayName || "").localeCompare(String(b.displayName || "")));
}
function hydrateState(structure, resultsMap = {}) {
  const src = structure || {};
  const boxes = {};
  for (const id of Object.keys(src.boxes || {})) {
    const b = src.boxes[id];
    boxes[id] = { id, slotA: b.slotA, slotB: b.slotB, result: resultsMap && resultsMap[id] != null ? { winnerId: resultsMap[id] } : null, score: null };
  }
  return { rounds: (src.rounds || []).map((r) => [...r]), boxes, _nextId: 1, _lastCreated: [] };
}
function participantsInRound(state, roundIndex) {
  const loc = locate(state);
  const set = /* @__PURE__ */ new Set();
  for (const boxId of state.rounds[roundIndex] || []) {
    for (const slot of ["A", "B"]) {
      const pid = resolveParticipant(state, loc, boxId, slot);
      if (pid != null) set.add(pid);
    }
  }
  return set;
}
function predictedLosers(structure, picks, roundIndex) {
  const st = hydrateState(structure, picks || {});
  const loc = locate(st);
  const losers = [];
  for (const boxId of st.rounds[roundIndex] || []) {
    const a = resolveParticipant(st, loc, boxId, "A");
    const b = resolveParticipant(st, loc, boxId, "B");
    const w = st.boxes[boxId].result?.winnerId;
    if (a != null && b != null && w != null) losers.push(w === a ? b : a);
  }
  return losers;
}
function gradeSleepers(officialState, entry, pool) {
  const none = { sleeper1Hit: false, sleeper2Hit: false, sleeperBonus: 0 };
  if (!pool || !pool.enableSleepers || !entry) return none;
  const check = (pid, targetRound, points) => {
    if (!pid || targetRound >= officialState.rounds.length) return [false, 0];
    const made = participantsInRound(officialState, targetRound).has(pid);
    return [made, made ? Number(points) || 0 : 0];
  };
  const [sleeper1Hit, b1] = check(entry.sleeper1, 2, pool.sleeper1Points);
  const [sleeper2Hit, b2] = check(entry.sleeper2, 3, pool.sleeper2Points);
  return { sleeper1Hit, sleeper2Hit, sleeperBonus: b1 + b2 };
}
function blankPrediction(bracketState) {
  const boxes = {};
  for (const id of Object.keys(bracketState.boxes)) {
    const b = bracketState.boxes[id];
    boxes[id] = { id, slotA: b.slotA, slotB: b.slotB, result: null, score: null };
  }
  return { rounds: bracketState.rounds.map((r) => [...r]), boxes, _nextId: bracketState._nextId || 1, _lastCreated: [] };
}
function applyPicks(state, picks) {
  let next = state;
  for (const [boxId, winnerId] of Object.entries(picks || {})) {
    try {
      next = setResult(next, boxId, winnerId);
    } catch {
    }
  }
  return next;
}

// src/lib/standardBracket.js
function convertLegacyMatchups(matchups) {
  if (!Array.isArray(matchups) || matchups.length === 0) {
    throw new Error("matchups must be a non-empty array of rounds");
  }
  let state = createBracket();
  matchups.forEach((round, r) => {
    round.forEach((_m, p) => {
      if (r === 0) state = addFirst(state);
      else if (p === 0) state = after(state, state.rounds[r - 1][0]);
      else state = beside(state, state.rounds[r][state.rounds[r].length - 1]);
    });
  });
  const nameMap = {};
  const pidFor = (entry, fallbackIdx) => {
    const n = entry.seed != null ? entry.seed : fallbackIdx + 1;
    return `p${n}`;
  };
  const firstRound = matchups[0];
  const round0Ids = state.rounds[0];
  firstRound.forEach((match, m) => {
    const box = state.boxes[round0Ids[m]];
    for (const [key, entry, idx] of [
      ["slotA", match.entry1, m * 2],
      ["slotB", match.entry2, m * 2 + 1]
    ]) {
      if (entry && entry.name != null) {
        const pid = pidFor(entry, idx);
        box[key] = {
          type: SLOT.NAMED,
          participantId: pid,
          name: entry.name,
          ...entry.seed != null ? { seed: entry.seed } : {}
        };
        nameMap[pid] = entry.name;
      } else {
        box[key] = { type: SLOT.BYE };
      }
    }
  });
  const loc = locate(state);
  matchups.forEach((round, r) => {
    round.forEach((match, p) => {
      if (match.winner !== 1 && match.winner !== 2) return;
      const boxId = state.rounds[r][p];
      const slot = match.winner === 1 ? "A" : "B";
      const a = slotDisplay(state, loc, boxId, "A").type;
      const b = slotDisplay(state, loc, boxId, "B").type;
      if (a === SLOT.BYE || b === SLOT.BYE) return;
      const pid = resolveParticipant(state, loc, boxId, slot);
      if (pid == null) return;
      state.boxes[boxId].result = { winnerId: pid };
    });
  });
  return { state, nameMap };
}
function structureFromState(state) {
  const boxes = {};
  const nameMap = {};
  const seedMap = {};
  for (const id of Object.keys(state.boxes)) {
    const b = state.boxes[id];
    boxes[id] = { slotA: b.slotA, slotB: b.slotB };
    for (const k of ["slotA", "slotB"]) {
      const s = b[k];
      if (s.type === SLOT.NAMED) {
        nameMap[s.participantId] = s.name;
        if (s.seed != null) seedMap[s.participantId] = s.seed;
      }
    }
  }
  return {
    rounds: state.rounds.map((r) => [...r]),
    boxes,
    nameMap,
    seedMap,
    roundCount: state.rounds.length
  };
}

// src/lib/legacyPoolAdapter.js
function isLegacyPool(pool) {
  return !!pool && Array.isArray(pool.bracketMatchups);
}
function isLegacyEntry(entry) {
  return !!entry && Array.isArray(entry.predictions);
}
function legacyResultsToMap(matchupsWithWinners) {
  const { state } = convertLegacyMatchups(matchupsWithWinners);
  return picksFromState(state);
}
function adaptLegacyPool(pool) {
  if (!isLegacyPool(pool)) return pool;
  const { state } = convertLegacyMatchups(pool.bracketMatchups);
  const structure = structureFromState(state);
  let customResults = pool.customResults || {};
  if (!Object.hasOwn(pool, "customResults") && Array.isArray(pool.results) && pool.results.length) {
    customResults = legacyResultsToMap(pool.results);
  }
  return {
    ...pool,
    bracketType: "custom",
    // route to the unified pool UI
    bracketMatchups: structure,
    // { rounds, boxes, nameMap, seedMap, roundCount }
    customResults,
    _legacy: true
    // breadcrumb for debugging/telemetry
  };
}
function normalizeSleeper(value) {
  if (value == null) return null;
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
    }
  }
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.seed != null) return `p${v.seed}`;
  return null;
}
function adaptLegacyEntry(entry) {
  if (!isLegacyEntry(entry)) return { ...entry, sleeper1: normalizeSleeper(entry.sleeper1), sleeper2: normalizeSleeper(entry.sleeper2) };
  const { state } = convertLegacyMatchups(entry.predictions);
  return {
    ...entry,
    predictions: picksFromState(state),
    champion: getChampion(state),
    sleeper1: normalizeSleeper(entry.sleeper1),
    sleeper2: normalizeSleeper(entry.sleeper2),
    _legacy: true
  };
}

// src/lib/poolLifecycle.js
function timestampMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return +value.toDate();
  if (value.seconds != null) return value.seconds * 1e3;
  const n = +new Date(value);
  return Number.isFinite(n) ? n : null;
}

// src/lib/customBracketCodec.js
var matchNumber = (id) => {
  const m = /^m(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : 0;
};
function deserialize(data) {
  const boxesIn = data.boxes || {}, results = data.results || {}, scores = data.scores || {};
  const boxes = {};
  let maxId = 0;
  for (const id of Object.keys(boxesIn)) {
    const b = boxesIn[id];
    boxes[id] = {
      id,
      slotA: b.slotA,
      slotB: b.slotB,
      result: results[id] != null ? { winnerId: results[id] } : null,
      score: scores[id] ? { a: scores[id].a, b: scores[id].b } : null
    };
    const n = matchNumber(id);
    if (n > maxId) maxId = n;
  }
  const rounds = (data.rounds || []).map((r) => Array.isArray(r) ? [...r] : [...r && r.ids || []]);
  return { rounds, boxes, _nextId: maxId + 1, _lastCreated: [] };
}

// src/lib/weeklyState.js
function weekKey(data) {
  return data?.weekId || `legacy-${timestampMillis(data?.startDate) || 0}`;
}
function dateKeyET(now = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function weeklyVotingOpen(data, now = /* @__PURE__ */ new Date()) {
  if (!data) return false;
  const round = data.currentRound || 0;
  const matches = data.matchups?.[round];
  if (!matches?.length || matches.some((m) => m.winner || !m.entry1 || !m.entry2)) return false;
  const start = timestampMillis(data.startDate);
  if (!Number.isFinite(start)) return false;
  const day = new Date(start).toISOString().slice(0, 10);
  const end = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + round + 1);
  const today = dateKeyET(now);
  return today >= day && today < end.toISOString().slice(0, 10);
}
function standardWeeklyMatchups(data) {
  if (data.type !== "standard" || ![32, 64].includes(data.participantCount) || data.status !== "published") return null;
  const state = deserialize(data);
  if (state.rounds.length !== Math.log2(data.participantCount)) return null;
  const rounds = state.rounds.map((ids, r) => ids.map((id) => {
    const box = state.boxes[id];
    const entry = (slot) => slot?.type === "named" ? { name: slot.name, seed: Number(String(slot.participantId).replace(/^p/, "")) || null } : null;
    return { entry1: r ? null : entry(box.slotA), entry2: r ? null : entry(box.slotB) };
  }));
  return rounds[0].every((m) => m.entry1 && m.entry2) ? rounds : null;
}

// src/services/interactiveSort.js
function computeConsensus(rankings) {
  if (!rankings || rankings.length === 0) return [];
  const scores = /* @__PURE__ */ new Map();
  for (const ranking of rankings) {
    const n = ranking.length;
    for (let i = 0; i < n; i++) {
      const id = ranking[i];
      const points = n - 1 - i;
      scores.set(id, (scores.get(id) || 0) + points);
    }
  }
  const result = Array.from(scores.entries()).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
  return result;
}

// src/lib/recordValidation.js
var object = (value) => value && typeof value === "object" && !Array.isArray(value);
function validateLegacyMatchups(value) {
  const entry = (e) => e == null || object(e) && typeof e.name === "string" && (e.seed == null || typeof e.seed === "string" || Number.isFinite(e.seed));
  if (!Array.isArray(value) || !value.length || !value.every((round) => Array.isArray(round) && round.every((match) => object(match) && entry(match.entry1) && entry(match.entry2) && [null, void 0, 1, 2].includes(match.winner)))) throw Error("This bracket contains damaged matchup data.");
  return value;
}
function validateStructure(value) {
  if (!object(value) || !Array.isArray(value.rounds) || !object(value.boxes)) throw Error("This bracket contains damaged structure data.");
  const ids = value.rounds.flat();
  if (!value.rounds.every(Array.isArray) || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !Object.hasOwn(value.boxes, id)) || Object.keys(value.boxes).some((id) => !ids.includes(id))) throw Error("This bracket contains damaged rounds.");
  for (const box of Object.values(value.boxes)) {
    if (!object(box)) throw Error("This bracket contains a damaged matchup.");
    for (const slot of [box.slotA, box.slotB]) if (!object(slot) || !["open", "named", "bye", "feed"].includes(slot.type) || slot.name != null && typeof slot.name !== "string") throw Error("This bracket contains a damaged participant.");
  }
  if (value.nameMap && (!object(value.nameMap) || Object.values(value.nameMap).some((name) => typeof name !== "string"))) throw Error("This bracket contains damaged participant names.");
  return value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  adaptLegacyEntry,
  adaptLegacyPool,
  applyPicks,
  blankPrediction,
  buildLeaderboard,
  computeConsensus,
  dateKeyET,
  defaultRoundPoints,
  getChampion,
  gradeSleepers,
  hydrateState,
  isEntryComplete,
  isLegacyEntry,
  isLegacyPool,
  legacyResultsToMap,
  normalizeSleeper,
  participantsInRound,
  picksFromState,
  predictedLosers,
  scoreEntry,
  setResult,
  standardWeeklyMatchups,
  validateLegacyMatchups,
  validateStructure,
  weekKey,
  weeklyVotingOpen
});
