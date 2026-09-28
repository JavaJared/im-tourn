import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import { generateDefaultBracketLayout } from '../src/lib/defaultBracketLayout';
import { SLOT, MAX_PARTICIPANTS, createBracket, locate, setSlotName, validateForPublish, resolveParticipant, setResult, getChampion } from '../src/lib/customBracket';
import CustomBracketBuilder from '../src/components/CustomBracketBuilder';
const mocks = vi.hoisted(()=>({persist:vi.fn().mockResolvedValue(),publish:vi.fn()}));
vi.mock('../src/services/customBracketService',()=>({
 subscribeToBracket:(_id,callback)=>{callback(createBracket(),{exists:true});return ()=>{};},
 persistStructure:(...args)=>mocks.persist(...args), publishBracket:(...args)=>mocks.publish(...args),
}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());vi.clearAllMocks();});
test('every supported size has the exact entry slots and byes and can play through to a champion',()=>{
 for(let count=2;count<=MAX_PARTICIPANTS;count++) {
  let state=generateDefaultBracketLayout(count);
  const padded=2**Math.ceil(Math.log2(count));
  const slots=state.rounds[0].flatMap(id=>[state.boxes[id].slotA,state.boxes[id].slotB]);
  expect(slots.filter(s=>s.type===SLOT.OPEN)).toHaveLength(count);
  expect(slots.filter(s=>s.type===SLOT.BYE)).toHaveLength(padded-count);
  expect(state.rounds.at(-1)).toHaveLength(1);
  expect(validateForPublish(state).valid).toBe(false);
  let named=0;
  for(const id of state.rounds[0]) {
   expect([state.boxes[id].slotA,state.boxes[id].slotB].every(s=>s.type===SLOT.BYE)).toBe(false);
   for(const slot of ['A','B']) if(state.boxes[id][`slot${slot}`].type===SLOT.OPEN) {
    named++;
    state=setSlotName(state,id,slot,`p${named}`,`Player ${named}`);
   }
  }
  expect(validateForPublish(state).valid).toBe(true);
  const loc=locate(state); let played=0;
  for(const round of state.rounds) for(const id of round) {
   const a=resolveParticipant(state,loc,id,'A'),b=resolveParticipant(state,loc,id,'B');
   if(a===null||b===null)continue;
   expect(a).toBeTruthy();expect(b).toBeTruthy();
   state=setResult(state,id,a);played++;
  }
  expect(played).toBe(count-1);
  expect(getChampion(state)).toBeTruthy();
 }
});
test.each([0,1,101,2.5,NaN,Infinity,'12'])('rejects invalid count %s',count=>{
 expect(()=>generateDefaultBracketLayout(count)).toThrow('Choose a whole number');
});
test('builder generates and autosaves an unnamed layout, then saves participant edits',async()=>{
 await act(async()=>{tree=create(<CustomBracketBuilder bracketId="draft"/>);});
 const count=tree.root.findByProps({type:'number'});
 act(()=>count.props.onChange({target:{value:'5'}}));
 expect(JSON.stringify(tree.toJSON())).toContain('3 rounds · 3 automatic byes');
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(mocks.persist).toHaveBeenLastCalledWith('draft',generateDefaultBracketLayout(5));
 const names=tree.root.findAllByType('input');
 expect(names).toHaveLength(5);
 expect(names.every(input=>input.props.defaultValue==='')).toBe(true);
 await act(async()=>names[0].props.onBlur({currentTarget:{value:'First player'}}));
 const saved=mocks.persist.mock.calls.at(-1)[1];
 expect(JSON.stringify(saved)).toContain('First player');
 expect(mocks.publish).not.toHaveBeenCalled();
 expect(tree.root.findAllByType('form')).toHaveLength(0);
});
test('manual blank-canvas creation remains available',async()=>{
 await act(async()=>{tree=create(<CustomBracketBuilder bracketId="draft"/>);});
 const manual=tree.root.findAllByType('button').find(b=>b.children.some(child=>typeof child==='string'&&child.includes('Start with a blank canvas')));
 await act(async()=>manual.props.onClick());
 expect(tree.root.findAllByType('input')).toHaveLength(2);
 expect(mocks.persist.mock.calls.at(-1)[1].rounds[0]).toHaveLength(1);
});
