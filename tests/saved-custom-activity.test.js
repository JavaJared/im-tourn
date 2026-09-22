import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import CustomBracketFill from '../src/components/CustomBracketFill';
import { generateSeededBracket } from '../src/lib/standardBracket';
const mocks = vi.hoisted(() => ({ state:null, status:'published', own:vi.fn(), all:vi.fn(), submit:vi.fn(),load:vi.fn() }));
vi.mock('../src/services/customBracketService',()=>({subscribeToBracket:(_id,callback)=>{callback(mocks.state,{exists:true,raw:{title:'Saved',status:mocks.status}});return ()=>{};},getCustomFill:mocks.own,getCustomFills:mocks.all,submitCustomFill:mocks.submit}));
vi.mock('../src/components/BracketBoard',()=>({default:({state,editable})=>createElement('section',{'data-pick':state.boxes[state.rounds[0][0]].result?.winnerId,'data-editable':editable})}));
vi.mock('../src/services/server',()=>({callServer:(...args)=>mocks.load(...args)}));
vi.mock('../src/lib/exportBracketPdf',()=>({exportBracketPdf:vi.fn()}));
let tree;
beforeEach(()=>{ vi.clearAllMocks(); mocks.own.mockReset(); mocks.load.mockReset().mockResolvedValue({found:false}); mocks.all.mockReset(); mocks.status='published'; mocks.state=generateSeededBracket(['A','B']); });
afterEach(()=>{if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();});
test('saved activity opens the account submission instead of overwriting it with a local draft',async()=>{
 mocks.state=generateSeededBracket(['A','B']); const box=mocks.state.rounds[0][0];
 mocks.own.mockResolvedValue({id:'alice',userId:'alice',picks:{[box]:'p1'}});
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({[box]:'p2'})});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice',openSaved:true}));});
 const board=tree.root.findByType('section'); expect(board.props['data-pick']).toBe('p1');expect(board.props['data-editable']).toBe(false);
 expect(mocks.all).not.toHaveBeenCalled();
 expect(tree.root.findAllByType('select')).toHaveLength(0);
 expect(tree.root.findAllByType('button').some(button=>button.children.includes('Save my bracket'))).toBe(false);
});
test.each(['locked','complete'])('saved picks remain readable when the bracket is %s',async status=>{
 mocks.status=status; const box=mocks.state.rounds[0][0];
 mocks.own.mockResolvedValue({id:'alice',userId:'alice',picks:{[box]:'p1'}});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice',openSaved:true}));});
 expect(tree.root.findByType('section').props['data-pick']).toBe('p1');
 expect(tree.root.findByType('section').props['data-editable']).toBe(false);
});
test('failed saved loads offer retry and back without exposing a local draft',async()=>{
 mocks.own.mockRejectedValueOnce(new Error('offline'));
 vi.stubGlobal('localStorage',{getItem:vi.fn(()=>JSON.stringify({[mocks.state.rounds[0][0]]:'p2'}))});
 const back=vi.fn();
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice',openSaved:true,onExit:back}));});
 expect(tree.root.findAllByType('section')).toHaveLength(0);
 expect(localStorage.getItem).not.toHaveBeenCalled();
 act(()=>tree.root.findByProps({'aria-label':'Back'}).props.onClick());expect(back).toHaveBeenCalled();
 mocks.own.mockResolvedValue({id:'alice',userId:'alice',picks:{[mocks.state.rounds[0][0]]:'p1'}});
 await act(async()=>tree.root.findAllByType('button').find(button=>button.children.includes('Retry')).props.onClick());
 expect(tree.root.findByType('section').props['data-pick']).toBe('p1');
 expect(mocks.submit).not.toHaveBeenCalled();
});
test('a previous account response cannot replace the current account saved picks',async()=>{
 let resolveAlice; const box=mocks.state.rounds[0][0];
 mocks.own.mockImplementation((_bracket,uid)=>uid==='alice' ? new Promise(resolve=>{resolveAlice=resolve;}) : Promise.resolve({id:'bob',userId:'bob',picks:{[box]:'p2'}}));
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice',openSaved:true}));});
 expect(tree.root.findAllByType('section')).toHaveLength(0);
 await act(async()=>tree.update(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'bob',openSaved:true})));
 await act(async()=>resolveAlice({id:'alice',userId:'alice',picks:{[box]:'p1'}}));
 expect(tree.root.findByType('section').props['data-pick']).toBe('p2');
});
test('normal fill mode still permits saving current picks',async()=>{
 mocks.all.mockResolvedValue([]);
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({[mocks.state.rounds[0][0]]:'p1'})});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice'}));});
 expect(tree.root.findByType('section').props['data-editable']).toBe(true);
 await act(async()=>tree.root.findAllByType('button').find(button=>button.props.onClick&&button.props.disabled===false).props.onClick());
 expect(mocks.submit).toHaveBeenCalledWith('b',expect.objectContaining({userId:'alice'}));
});

test('normal fill defaults to account picks and preserves newer local drafts',async()=>{
 const box=mocks.state.rounds[0][0];
 mocks.load.mockResolvedValue({found:true,picks:{[box]:'p1'},savedAt:200});
 vi.stubGlobal('localStorage',{getItem:()=>null});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice'}));});
 expect(tree.root.findByType('section').props['data-pick']).toBe('p1');
 expect(mocks.all).not.toHaveBeenCalled();
 act(()=>tree.unmount());
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({picks:{[box]:'p2'},updatedAt:300})});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice'}));});
 expect(tree.root.findByType('section').props['data-pick']).toBe('p2');
 expect(JSON.stringify(tree.toJSON())).toContain('Unsaved picks restored');
});
