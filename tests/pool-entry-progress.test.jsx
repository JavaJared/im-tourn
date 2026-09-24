import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,test,vi} from 'vitest';
import {generateSeededBracket} from '../src/lib/standardBracket';
import {setResult} from '../src/lib/customBracket';
import {picksFromState} from '../src/lib/customScoring';
import {predictedFinish} from '../src/lib/poolEntryProgress';
import Board from '../src/components/pools/PoolBoard';
const base=()=>generateSeededBracket(['A','B','C','D']);
function complete(){let s=base();s=setResult(s,s.rounds[0][0],'p1');s=setResult(s,s.rounds[0][1],'p2');return setResult(s,s.rounds[1][0],'p1');}
test('predicts each entrant’s finish from the member’s picks, independent of official results',()=>{
 const state=complete(),picks=picksFromState(state);
 expect(predictedFinish(base(),picks,'p1')).toBe('Champion');
 expect(predictedFinish(base(),picks,'p2')).toBe('Runner-up (final)');
 expect(predictedFinish(base(),picks,'p3')).toBe('Out in round 1');
 expect(predictedFinish(base(),picks,'p4')).toBe('Out in round 1');
 const other=setResult(state,state.rounds[1][0],'p2');
 expect(predictedFinish(state,picksFromState(other),'p1')).toBe('Runner-up (final)');
});
test('missing, incomplete and malformed picks do not imply a predicted elimination',()=>{
 expect(predictedFinish(base(),null,'p1')).toBe('Not submitted');
 expect(predictedFinish(base(),{},'p1')).toBe('Picks incomplete');
 expect(predictedFinish(base(),'bad','p1')).toBe('Picks unavailable');
 expect(predictedFinish(base(),{removed:'p1'},'p1')).toBe('Picks unavailable');
});
test('read-only names are buttons that inspect picks; editable names still select winners',()=>{
 let tree;const inspect=vi.fn(),pick=vi.fn();const state=complete();
 act(()=>{tree=create(<Board state={state} nameMap={{p1:'A',p2:'B',p3:'C',p4:'D'}} editable={false} onInspect={inspect} onPick={pick}/>);});
 const button=tree.root.findAllByType('button')[0];expect(button.props['aria-label']).toBe('View pool predictions for A');
 act(()=>button.props.onClick());expect(inspect).toHaveBeenCalledWith({pid:'p1',name:'A'});expect(pick).not.toHaveBeenCalled();
 act(()=>tree.update(<Board state={state} nameMap={{}} editable onInspect={inspect} onPick={pick}/>));
 act(()=>tree.root.findAllByType('button')[0].props.onClick());expect(pick).toHaveBeenCalledWith(state.rounds[0][0],'p1');expect(inspect).toHaveBeenCalledTimes(1);
 act(()=>tree.unmount());
});

test('byes auto-advance without requiring a pick',()=>{
 const structure={rounds:[['a','b'],['final']],boxes:{a:{slotA:{type:'named',participantId:'p1',name:'A'},slotB:{type:'bye'}},b:{slotA:{type:'named',participantId:'p2',name:'B'},slotB:{type:'named',participantId:'p3',name:'C'}},final:{slotA:{type:'winner'},slotB:{type:'winner'}}}};
 expect(predictedFinish(structure,{b:'p2',final:'p2'},'p1')).toBe('Runner-up (final)');
});
vi.mock('react-dom',()=>({createPortal:children=>children}));
vi.mock('../src/lib/useDialog',()=>({useDialog:()=>({current:null})}));
vi.mock('../src/components/layout/UserLink',()=>({default:({userId})=><span>{userId}</span>}));
test('dialog masks other members while predictions are private and offers pagination',async()=>{
 const {default:Dialog}=await import('../src/components/pools/EntryPredictionsDialog');
 vi.stubGlobal('document',{body:{}});let tree;
 const entries=Object.assign([{userId:'alice',predictions:picksFromState(complete())},{userId:'bob',predictions:picksFromState(complete())}],{predictionsHidden:true,nextCursor:'more'}),more=vi.fn();
 try{
  act(()=>{tree=create(<Dialog selection={{pid:'p1',name:'A'}} structure={base()} entries={entries} currentUserId="alice" loaded onClose={()=>{}} onLoadMore={more}/>);});
  const headings=tree.root.findAllByType('h4');expect(headings.map(h=>h.children[0])).toEqual(['Champion','Private until predictions close']);expect(tree.root.findAllByType('li').map(row=>row.findByType('span').children[0])).toEqual(['alice','bob']);
  await act(async()=>tree.root.findAllByType('button').find(button=>button.children.includes('Load more participants')).props.onClick());expect(more).toHaveBeenCalledOnce();
 }finally{if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();}
});


test('groups members by finish in round order, followed by runner-up and champion',async()=>{
 const {default:Dialog}=await import('../src/components/pools/EntryPredictionsDialog');
 const champion=complete();let runner=setResult(champion,champion.rounds[1][0],'p2');
 let early=setResult(base(),base().rounds[0][0],'p4');early=setResult(early,early.rounds[0][1],'p2');early=setResult(early,early.rounds[1][0],'p2');
 const entries=[{userId:'winner',predictions:picksFromState(champion)},{userId:'early-one',predictions:picksFromState(early)},{userId:'finalist',predictions:picksFromState(runner)},{userId:'early-two',predictions:picksFromState(early)}];
 vi.stubGlobal('document',{body:{}});let tree;
 try{
  act(()=>{tree=create(<Dialog selection={{pid:'p1',name:'A'}} structure={base()} entries={entries} loaded onClose={()=>{}}/>);});
  const groups=tree.root.findAllByProps({className:'entry-prediction-group'});
  expect(groups.map(group=>group.findByType('h4').children[0])).toEqual(['Out in round 1','Runner-up (final)','Champion']);
  expect(groups[0].findAllByType('li').map(row=>row.findByType('span').children[0])).toEqual(['early-one','early-two']);
  expect(groups[0].findByType('h4').findByType('span').children).toEqual(['(', '2', ')']);
 }finally{if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();}
});
