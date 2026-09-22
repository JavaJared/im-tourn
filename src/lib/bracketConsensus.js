import { deserialize } from './customBracketCodec';
import { convertLegacyMatchups, structureFromState } from './standardBracket';
import { blankPrediction, picksFromState } from './customScoring';
import { locate, resolveParticipant, matchWinner, setResult, SLOT } from './customBracket';
import { validateLegacyMatchups, validateStructure } from './recordValidation';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const entryKey = entry => entry ? JSON.stringify([entry.name, entry.seed ?? null]) : null;
export function pickSource(type, source) {
  if (type === 'legacy') return blankPrediction(convertLegacyMatchups(validateLegacyMatchups(parse(source.matchups)), { positionalIds:true }).state);
  const state = deserialize(source); validateStructure(state); return blankPrediction(state);
}
export function compatiblePickState(type, source, data, preparedSource) {
  try {
    const base = preparedSource || pickSource(type, source), locations = locate(base);
    let picks;
    if (type === 'legacy') {
      const original = parse(source.matchups), saved = validateLegacyMatchups(parse(data.matchups));
      if (saved.length !== original.length || saved.some((round,r) => round.length !== original[r].length)) return null;
      if (saved[0].some((match,i) => ['entry1','entry2'].some(key => entryKey(match[key]) !== entryKey(original[0][i][key])))) return null;
      const converted = convertLegacyMatchups(saved, { positionalIds:true }).state;
      picks = picksFromState(converted);
      // Reject impossible or inconsistent later-round entrants, not just matching seeds.
      const labels = {};
      for (const box of Object.values(base.boxes)) for (const slot of [box.slotA,box.slotB]) if (slot.type === SLOT.NAMED) labels[slot.participantId] = entryKey(slot);
      for (let r=0;r<saved.length;r++) for(let p=0;p<saved[r].length;p++) {
        const id=converted.rounds[r][p];
        for (const [side,key] of [['A','entry1'],['B','entry2']]) {
          const pid=resolveParticipant(converted,locations,id,side);
          if ((labels[pid] || null) !== entryKey(saved[r][p][key])) return null;
        }
        if (![1,2].includes(saved[r][p].winner)) return null;
      }
    } else picks = data.picks;
    if (!picks || typeof picks !== 'object' || Array.isArray(picks) || Object.keys(picks).some(id => !base.boxes[id])) return null;
    let state = base;
    for (const round of state.rounds) for (const id of round) {
      if (picks[id] != null) state = setResult(state,id,picks[id]);
      if (matchWinner(state,locations,id) == null) return null;
    }
    return state;
  } catch { return null; }
}
export function consensusBracket(base, states) {
  let state = blankPrediction(base);
  const loc=locate(state), counts=state.rounds.map(()=>({})), support={};
  const order={}; let n=0;
  for (const round of state.rounds) for (const id of round) for (const slot of [state.boxes[id].slotA,state.boxes[id].slotB]) if (slot.type===SLOT.NAMED) order[slot.participantId]=n++;
  for (const saved of states) saved.rounds.forEach((round,r)=>round.forEach(id=>{
    const pid=matchWinner(saved,loc,id); if(pid!=null) counts[r][pid]=(counts[r][pid]||0)+1;
  }));
  state.rounds.forEach((round,r)=>round.forEach(id=>{
    const a=resolveParticipant(state,loc,id,'A'),b=resolveParticipant(state,loc,id,'B');
    if(a==null || b==null) return; // Byes resolve automatically; unanswered feeders stay unresolved.
    const ca=counts[r][a]||0, cb=counts[r][b]||0, tied=ca===cb;
    support[id]={counts:{[a]:ca,[b]:cb},sampleSize:states.length,tied:tied&&ca>0,noSupport:ca===0&&cb===0};
    if(ca===0&&cb===0) return;
    let winner=ca>cb?a:b;
    if(tied){const pa=r ? counts[r-1][a]||0 : 0,pb=r ? counts[r-1][b]||0 : 0;winner=pa!==pb?(pa>pb?a:b):(order[a]<order[b]?a:b);}
    state=setResult(state,id,winner);
  }));
  const {nameMap,seedMap}=structureFromState(state);
  return {state,nameMap,seedMap,support,sampleSize:states.length};
}
