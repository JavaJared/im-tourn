import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import CustomBracketFill from '../src/components/CustomBracketFill';
import { generateSeededBracket } from '../src/lib/standardBracket';
const mocks = vi.hoisted(() => ({ state:null, own:vi.fn(), all:vi.fn() }));
vi.mock('../src/services/customBracketService',()=>({subscribeToBracket:(_id,callback)=>{callback(mocks.state,{exists:true,raw:{title:'Saved',status:'published'}});return ()=>{};},getCustomFill:mocks.own,getCustomFills:mocks.all,submitCustomFill:vi.fn()}));
vi.mock('../src/components/BracketBoard',()=>({default:({state,editable})=>createElement('section',{'data-pick':state.boxes[state.rounds[0][0]].result?.winnerId,'data-editable':editable})}));
vi.mock('../src/lib/exportBracketPdf',()=>({exportBracketPdf:vi.fn()}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();});
test('saved activity opens the account submission instead of overwriting it with a local draft',async()=>{
 mocks.state=generateSeededBracket(['A','B']); const box=mocks.state.rounds[0][0];
 mocks.own.mockResolvedValue({id:'alice',userId:'alice',picks:{[box]:'p1'}});
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({[box]:'p2'})});
 await act(async()=>{tree=create(createElement(CustomBracketFill,{bracketId:'b',currentUserId:'alice',openSaved:true}));});
 const board=tree.root.findByType('section'); expect(board.props['data-pick']).toBe('p1');expect(board.props['data-editable']).toBe(false);
 expect(mocks.all).not.toHaveBeenCalled();
});
