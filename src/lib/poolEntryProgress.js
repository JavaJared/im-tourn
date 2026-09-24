import {hydrateState} from './customScoring';
import {locate,resolveParticipant,matchWinner} from './customBracket';

// Follow each member's own bracket, rather than the official results. This
// handles byes and participants whose predicted opponents differ between users.
export function predictedFinish(structure,predictions,participantId){
  if(predictions==null)return 'Not submitted';
  if(typeof predictions!=='object'||Array.isArray(predictions))return 'Picks unavailable';
  try{
    const state=hydrateState(structure,predictions),locations=locate(state);
    if(!state.rounds.length||Object.keys(predictions).some(id=>!state.boxes[id]))return 'Picks unavailable';
    let finish=null;
    for(let r=0;r<state.rounds.length;r++)for(const id of state.rounds[r]){
      const a=resolveParticipant(state,locations,id,'A'),b=resolveParticipant(state,locations,id,'B');
      const winner=matchWinner(state,locations,id);
      if(winner==null)return 'Picks incomplete';
      if(winner!==a&&winner!==b)return 'Picks unavailable';
      if(a!==participantId&&b!==participantId)continue;
      if(winner!==participantId)finish=r===state.rounds.length-1?'Runner-up (final)':`Out in round ${r+1}`;
      else if(r===state.rounds.length-1)finish='Champion';
    }
    return finish||'Entry unavailable';
  }catch{return 'Picks unavailable';}
}
