import {expect,test} from 'vitest';
import {applyPoolScores} from '../src/lib/poolScoreResults';
import {generateSeededBracket} from '../src/lib/standardBracket';
import {locate,resolveParticipant,setResult} from '../src/lib/customBracket';
const initial=()=>generateSeededBracket(['A','B','C','D'].map((name,i)=>({name,seed:i+1})));
test('both scores select the higher participant; repeats do not toggle winners',()=>{
 const state=initial(),id=state.rounds[0][0],a=resolveParticipant(state,locate(state),id,'A');
 const partial=applyPoolScores(state,{}, {[`${id}:a`]:5});expect(partial.state.boxes[id].result).toBeFalsy();
 const full=applyPoolScores(partial.state,partial.scores,{[`${id}:b`]:0});expect(full.state.boxes[id].result.winnerId).toBe(a);
 const repeat=applyPoolScores(full.state,full.scores,{[`${id}:b`]:0});expect(repeat.state.boxes[id].result.winnerId).toBe(a);
 for(const value of [5,null]){const cleared=applyPoolScores(full.state,full.scores,{[`${id}:b`]:value});expect(cleared.state.boxes[id].result).toBeNull();}
});
test('correcting a winner clears downstream results and scores',()=>{
 let state=initial();const [left,right]=state.rounds[0],final=state.rounds[1][0];
 const loc=locate(state);
 state=setResult(state,left,resolveParticipant(state,loc,left,'A'));
 state=setResult(state,right,resolveParticipant(state,loc,right,'A'));
 state=setResult(state,final,resolveParticipant(state,loc,final,'A'));
 const result=applyPoolScores(state,{[left]:{a:10,b:4},[final]:{a:20,b:10}},{[`${left}:b`]:11});
 expect(result.state.boxes[left].result.winnerId).toBe(resolveParticipant(state,loc,left,'B'));
 expect(result.state.boxes[final].result).toBeNull();expect(result.scores).not.toHaveProperty(final);
});
test('invalid scores and nonexistent matchups are rejected; unresolved rounds never auto-select',()=>{
 const state=initial(),id=state.rounds[0][0],final=state.rounds[1][0];
 for(const value of [-1,NaN,Infinity,'10',undefined])expect(()=>applyPoolScores(state,{}, {[`${id}:a`]:value})).toThrow();
 expect(()=>applyPoolScores(state,{}, {'m999:a':1})).toThrow();
 const result=applyPoolScores(state,{}, {[`${final}:a`]:10,[`${final}:b`]:2});expect(result.state.boxes[final].result).toBeFalsy();
});
