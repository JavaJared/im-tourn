import {expect,test} from 'vitest';
import {generateSeededBracket} from '../src/lib/standardBracket';
import {serialize} from '../src/lib/customBracketCodec';
import {setResult,getChampion} from '../src/lib/customBracket';
import {picksFromState} from '../src/lib/customScoring';
import {consensusBracket,compatiblePickState} from '../src/lib/bracketConsensus';
const base=()=>generateSeededBracket(['A','B','C','D']);
function filled(a,b,final){let s=base();s=setResult(s,s.rounds[0][0],a);s=setResult(s,s.rounds[0][1],b);return setResult(s,s.rounds[1][0],final);}
test('consensus uses advancement support and always advances a reachable entrant',()=>{
 const result=consensusBracket(base(),[filled('p1','p2','p1'),filled('p1','p3','p3'),filled('p4','p2','p2')]);
 const final=result.state.rounds[1][0];
 expect(result.sampleSize).toBe(3);
 expect(result.support[final]).toMatchObject({counts:{p1:1,p2:1},tied:true});
 expect(getChampion(result.state)).toBe('p1'); // tied preceding support; original bracket order
});
test('zero support leaves the matchup and downstream picks unanswered',()=>{
 const result=consensusBracket(base(),[filled('p1','p3','p3'),filled('p4','p2','p4')]);
 const final=result.state.rounds[1][0];
 expect(result.support[final].noSupport).toBe(true);
 expect(getChampion(result.state)).toBeNull();
 expect(consensusBracket(base(),[]).sampleSize).toBe(0);
});
test('compatible submissions must be complete and valid for the current structure',()=>{
 const state=filled('p1','p2','p1'),source=serialize(base());
 expect(picksFromState(compatiblePickState('custom',source,{picks:picksFromState(state)}))).toEqual(picksFromState(state));
 expect(compatiblePickState('custom',source,{picks:{}})).toBeNull();
 expect(compatiblePickState('custom',source,{picks:{...picksFromState(state),removed:'p1'}})).toBeNull();
 expect(compatiblePickState('custom',source,{picks:{...picksFromState(state),[state.rounds[1][0]]:'p3'}})).toBeNull();
});
test('legacy compatibility rejects renamed entrants and invalid later-round participants',()=>{
 const rounds=[[{entry1:{name:'A',seed:1},entry2:{name:'B',seed:2},winner:null}]];
 const saved=[[{...rounds[0][0],winner:2}]];
 expect(compatiblePickState('legacy',{matchups:rounds},{matchups:JSON.stringify(saved)})).not.toBeNull();
 saved[0][0].entry2={name:'Changed',seed:2};
 expect(compatiblePickState('legacy',{matchups:rounds},{matchups:saved})).toBeNull();
});
test('byes advance automatically without inflating sample size',()=>{
 const source=generateSeededBracket(['A','B','C']);
 const result=consensusBracket(source,[]);
 expect(result.sampleSize).toBe(0);
 expect(getChampion(result.state)).toBeNull();
});
