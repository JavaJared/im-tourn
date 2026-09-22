import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import LegacyBracketBoard from '../src/components/LegacyBracketBoard';
import BracketBoard from '../src/components/BracketBoard';
import { selectFillWinner } from '../src/lib/fillDraft';
import { resolveParticipant, locate } from '../src/lib/customBracket';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); });
const source = () => [[
  {id:'legacy-a',entry1:{name:'Same',seed:1,extra:'preserve'},entry2:{name:'Same',seed:1},winner:1},
  {id:'legacy-b',entry1:{name:'C'},entry2:{name:'D',seed:'4'},winner:2},
], [{id:'legacy-final',entry1:{name:'Same',seed:1},entry2:{name:'D',seed:'4'},winner:2}]];
test('legacy rendering preserves picks, seeds and distinct entrants without rewriting original data', () => {
  const matchups=source(), original=structuredClone(matchups), onPick=vi.fn();
  act(() => { tree=create(<LegacyBracketBoard matchups={matchups} editable onPick={onPick} />); });
  const {state, nameMap, seedMap, onPick:select}=tree.root.findByType(BracketBoard).props;
  expect(Object.keys(nameMap)).toHaveLength(4);
  expect(Object.values(nameMap)).toEqual(['Same','Same','C','D']);
  expect(seedMap).toMatchObject({p1:1,p2:1,p4:'4'});
  const final=state.rounds[1][0], locations=locate(state);
  expect(state.boxes[final].result.winnerId).toBe('p4');
  act(() => select(final,resolveParticipant(state,locations,final,'A')));
  expect(onPick).toHaveBeenLastCalledWith(1,0,1);
  expect(matchups).toEqual(original);
});
test('upstream changes clear the displayed downstream pick through the legacy handler', () => {
  const changed=selectFillWinner(source(),0,0,2);
  act(() => { tree=create(<LegacyBracketBoard matchups={changed} editable onPick={()=>{}} />); });
  const {state}=tree.root.findByType(BracketBoard).props;
  expect(state.boxes[state.rounds[0][0]].result.winnerId).toBe('p2');
  expect(state.boxes[state.rounds[1][0]].result).toBeNull();
});
test('saved brackets are read-only and do not forward picks', () => {
  const onPick=vi.fn();
  act(() => { tree=create(<LegacyBracketBoard matchups={source()} onPick={onPick} />); });
  expect(tree.root.findAllByProps({className:'pick-control'})).toHaveLength(0);
  tree.root.findByType(BracketBoard).props.onPick('m1','p1');
  expect(onPick).not.toHaveBeenCalled();
});
