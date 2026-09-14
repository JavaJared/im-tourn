import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { generateSeededBracket } from '../src/lib/standardBracket';
import { locate, resolveParticipant, matchWinner, setResult } from '../src/lib/customBracket';
import { scoreEntry, gradeSleepers, picksFromState } from '../src/lib/customScoring';
import { explainEntry, analysisBlockReason, analysisMessage } from '../src/lib/poolStandings';
import { analyzeCustomPool, summarizeWinningScenarios } from '../src/lib/customElimination';
import PoolStandings from '../src/components/pools/PoolStandings';

function finish(state) {
  let next = state;
  for (const round of state.rounds) for (const id of round) {
    const loc = locate(next);
    if (matchWinner(next, loc, id) == null) next = setResult(next, id, resolveParticipant(next, loc, id, 'A'));
  }
  return next;
}
const make = n => generateSeededBracket(Array.from({length:n}, (_,i) => `Team ${i}`));
test('breakdown uses existing scoring and removes eliminated picks from remaining points', () => {
  const state = make(4), prediction = finish(state), entry = { predictions: picksFromState(prediction) };
  expect(explainEntry(state, entry, [1,3], {})).toMatchObject({basePoints:0,sleeperBonus:0,remainingBase:5,total:0});
  const id = state.rounds[0][0], loser = resolveParticipant(state, locate(state), id, 'B');
  const official = setResult(state, id, loser);
  expect(explainEntry(official, entry, [1,3], {})).toMatchObject({basePoints:0,remainingBase:1});
  const complete = finish(official), result = explainEntry(complete,entry,[1,3],{});
  expect(result.remainingPossible).toBe(0);
  expect(result.total).toBe(scoreEntry(complete,entry.predictions,[1,3]).total);
});
test('earned sleeper bonuses are counted once and eliminated or absent sleepers add nothing', () => {
  const state=make(8), final=finish(state), first=state.rounds[0][0];
  const pid=resolveParticipant(state,locate(state),first,'A');
  const pool={enableSleepers:true,sleeper1Points:8,sleeper2Points:20};
  const entry={predictions:picksFromState(final),sleeper1:pid};
  const pending=explainEntry(state,entry,[1,2,3],pool);
  expect(pending.remainingSleepers).toBe(8);
  const done=explainEntry(final,entry,[1,2,3],pool);
  expect(done.sleeperBonus).toBe(8); expect(done.remainingSleepers).toBe(0);
  expect(done.total).toBe(done.basePoints+8);
  const loss=setResult(state,first,resolveParticipant(state,locate(state),first,'B'));
  expect(explainEntry(loss,entry,[1,2,3],pool).remainingSleepers).toBe(0);
  expect(explainEntry(state,{predictions:entry.predictions},[1,2,3],pool).remainingSleepers).toBe(0);
});
test('ceiling is an honest upper bound across every completion with conflicting sleeper awards', () => {
  const state=make(8), prediction=finish(state);
  const sleeper=resolveParticipant(state,locate(state),state.rounds[0][0],'B');
  const entry={predictions:picksFromState(prediction),sleeper1:sleeper};
  const pool={enableSleepers:true,sleeper1Points:8}, points=[1,2,3];
  const bound=explainEntry(state,entry,points,pool).maxPossibleScore;
  let maximum=0, completions=0;
  function visit(working) {
    const loc=locate(working), id=working.rounds.flat().find(id=>matchWinner(working,loc,id)==null);
    if (!id) {
      const total=scoreEntry(working,entry.predictions,points).total+gradeSleepers(working,entry,pool).sleeperBonus;
      expect(total).toBeLessThanOrEqual(bound); maximum=Math.max(maximum,total); completions++; return;
    }
    for(const side of ['A','B']) visit(setResult(working,id,resolveParticipant(working,loc,id,side)));
  }
  visit(state);
  expect(completions).toBe(128); expect(maximum).toBeLessThan(bound);
});
test('byes use existing scoring and hidden, missing or damaged entries do not fabricate a breakdown', () => {
  const state=make(3), entry={predictions:picksFromState(finish(state))};
  const initial=explainEntry(state,entry,[1,2],{});
  expect(initial.basePoints).toBe(scoreEntry(state,entry.predictions,[1,2]).total);
  expect(explainEntry(finish(state),entry,[1,2],{}).remainingPossible).toBe(0);
  expect(explainEntry(state,{...entry,predictionsHidden:true,score:4},[1,2],{})).toMatchObject({total:4,breakdownUnavailable:expect.stringContaining('private')});
  expect(explainEntry(state,{dataError:true,score:4},[1,2],{}).total).toBeNull();
  expect(explainEntry(state,{},[1,2],{}).breakdownUnavailable).toBe('Not submitted');
});
test('pagination, privacy, refresh errors and malformed records block incomplete competitor analysis', () => {
  const entry={predictions:{m1:'p1'}}, base={entries:[entry],status:'in_progress'};
  expect(analysisBlockReason(base)).toBe('');
  expect(analysisBlockReason({...base,entries:Object.assign([entry],{nextCursor:'more'})})).toContain('Partial standings');
  expect(analysisBlockReason({...base,entries:Object.assign([entry],{predictionsHidden:true})})).toContain('private');
  expect(analysisBlockReason({...base,entries:[entry,{dataError:true}]})).toContain('unavailable');
  expect(analysisBlockReason({...base,entriesError:'network'})).toContain('stale');
  expect(analysisBlockReason({...base,loaded:false})).toContain('Loading');
});
test('search limits and capped paths have explicit labels and never imply exhaustive requirements', () => {
  const state=make(4), entries=[{userId:'a',predictions:picksFromState(finish(state))}];
  const fallback=analyzeCustomPool(state,{},entries,[1,2],{maxUndecidedForFullSearch:0});
  expect(fallback.analysisComplete).toBe(false); expect(fallback.incompleteReason).toBe('matchup_limit');
  expect(analysisMessage({analysis:fallback})).toContain('Incomplete analysis');
  expect(fallback.byUserId.a.status).toBe('unknown');
  const timeout=analyzeCustomPool(state,{},entries,[1,2],{deadlineMs:-1});
  expect(timeout.byUserId.a.status).toBe('unknown');
  expect(analysisMessage({analysis:timeout})).toContain('time limit');
  const capped={status:'alive',scenariosTruncated:true,winningScenarios:[{outcomes:{m1:'p1'}}]};
  expect(summarizeWinningScenarios(capped,{})).toBeNull();
  expect(analysisMessage({analysis:{analysisComplete:true,byUserId:{a:capped}}})).toContain('winning paths are incomplete');
});
test('standings explains values, labels partial ranks, shares tied ranks, and keeps private picks inaccessible', () => {
  const state=make(4), entry={id:'a',userId:'a',userDisplayName:'Alice',predictions:picksFromState(finish(state))};
  const scored={...entry,...explainEntry(state,entry,[1,2],{})};
  const html=renderToStaticMarkup(<PoolStandings entries={[scored,{...scored,id:'b',userId:'b',userDisplayName:'Bob'}]} nameMap={{}} partial analysisNotice="Partial standings" />);
  for(const label of ['Base points','Sleeper bonuses','Remaining possible','upper bound','Loaded rank 1 (tie)']) expect(html).toContain(label);
  expect(html).not.toContain('Loaded rank 2');
  const hidden=renderToStaticMarkup(<PoolStandings entries={[{...scored,predictionsHidden:true,...explainEntry(state,{predictionsHidden:true,score:0},[1,2],{})}]} nameMap={{}} analysisNotice="Picks private" />);
  expect(hidden).not.toContain('View picks'); expect(hidden).not.toContain('<dd>');
});
