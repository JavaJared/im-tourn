import { expect, test } from 'vitest';
import { builderSeedNumbers } from '../src/lib/builderSeedNumbers';
import { generateDefaultBracketLayout } from '../src/lib/defaultBracketLayout';
import { generateSeededBracket, getSeedOrder } from '../src/lib/standardBracket';

test('all default sizes use tournament seed order and skip byes',()=>{
 for(let n=2;n<=100;n++){
  const state=generateDefaultBracketLayout(n), before=JSON.stringify(state);
  const seeds=builderSeedNumbers(state);
  const order=getSeedOrder(2**Math.ceil(Math.log2(n)));
  expect(Object.keys(seeds)).toHaveLength(n);
  state.rounds[0].forEach((id,p)=>['A','B'].forEach((slot,k)=>{
   expect(seeds[id+':'+slot]).toBe(order[2*p+k]<n ? order[2*p+k]+1 : undefined);
  }));
  expect(JSON.stringify(state)).toBe(before);
 }
});
test('preserves existing participant seeds and handles empty builders',()=>{
 expect(builderSeedNumbers(null)).toEqual({});
 expect(builderSeedNumbers({rounds:[],boxes:{}})).toEqual({});
 const state=generateSeededBracket(['A','B','C','D']);
 const first=state.rounds[0][0];
 state.boxes[first].slotA.seed=10;
 expect(builderSeedNumbers(state)[first+':A']).toBe(10);
});
test('custom layouts include late entrants, omit feeds and byes, and have unique numbers',()=>{
 const state={rounds:[['a'],['b','c']],boxes:{
  a:{slotA:{type:'open'},slotB:{type:'bye'}},
  b:{slotA:{type:'open'},slotB:{type:'named',name:'Late entrant'}},
  c:{slotA:{type:'open'},slotB:{type:'open'}},
 }};
 const seeds=builderSeedNumbers(state);
 expect(Object.keys(seeds).sort()).toEqual(['a:A','b:B','c:A','c:B']);
 expect(Object.values(seeds).sort((a,b)=>a-b)).toEqual([1,2,3,4]);
});
