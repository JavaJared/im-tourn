import {expect,test} from 'vitest';
import {generateSeededBracket} from '../src/lib/standardBracket';
import {locate,resolveParticipant,setResult,getChampion} from '../src/lib/customBracket';
import {applyPicks,blankPrediction,picksFromState} from '../src/lib/customScoring';

test.each([16,32,64])('reconstructs all %i-entry picks regardless of database map ordering',size=>{
 const base=generateSeededBracket(Array.from({length:size},(_,i)=>`Entry ${i+1}`));
 let saved=base;
 for(const round of saved.rounds)for(const id of round)saved=setResult(saved,id,resolveParticipant(saved,locate(saved),id,'A'));
 const picks=picksFromState(saved);
 const alphabetical=Object.fromEntries(Object.entries(picks).sort(([a],[b])=>a.localeCompare(b)));
 const reversed=Object.fromEntries(Object.entries(picks).reverse());
 for(const unordered of [alphabetical,reversed]){
  const restored=applyPicks(blankPrediction(base),unordered);
  expect(picksFromState(restored)).toEqual(picks);
  expect(getChampion(restored)).toBe(getChampion(saved));
 }
});
