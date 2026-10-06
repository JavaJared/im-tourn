import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import CreatePage from '../src/pages/brackets/CreatePage';
import BracketDownloads from '../src/components/BracketDownloads';
import {validateForPublish} from '../src/lib/customBracket';
const mocks=vi.hoisted(()=>({standard:vi.fn(),custom:vi.fn()}));
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({currentUser:{uid:'alice'}})}));
vi.mock('../src/services/customBracketService',()=>({createStandardBracket:(...args)=>mocks.standard(...args),createCustomBracket:(...args)=>mocks.custom(...args)}));
vi.mock('../src/components/BracketBoard',()=>({default:({state})=><div data-preview={state}/>}));
vi.mock('../src/components/ActionDialog',()=>({default:({children})=><section role="dialog">{children}</section>}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;vi.clearAllMocks();});
const button=label=>tree.root.findAllByType('button').find(b=>b.children.includes(label));
function prepare(n){
 act(()=>{tree=create(<CreatePage onNavigate={vi.fn()}/>);});
 act(()=>tree.root.findByType('input').props.onChange({target:{value:'Movies'}}));
 act(()=>tree.root.findByType('select').props.onChange({target:{value:'Movies'}}));
 act(()=>button('Add entries').props.onClick());
 act(()=>tree.root.findByType('textarea').props.onChange({target:{value:Array.from({length:n},(_,i)=>`Entry ${i+1}`).join('\n')}}));
 act(()=>button('Use list').props.onClick());
}
test('automatic twelve-entry layout is reviewed before publishing and failures retain entries',async()=>{
 prepare(12);act(()=>button('Review matchups').props.onClick());
 expect(validateForPublish(tree.root.find(n=>n.type==='div'&&!!n.props['data-preview']).props['data-preview']).valid).toBe(true);
 expect(mocks.standard).not.toHaveBeenCalled();mocks.standard.mockRejectedValueOnce(Error('Offline')).mockResolvedValueOnce('published');
 await act(async()=>button('Publish bracket').props.onClick());expect(tree.root.findByProps({role:'alert'}).children).toContain('Offline');
 await act(async()=>button('Publish bracket').props.onClick());expect(mocks.standard.mock.calls[1][0].entries).toHaveLength(12);
});
test('advanced layout creates a valid draft without publishing',async()=>{
 prepare(5);mocks.custom.mockResolvedValue('draft');await act(async()=>button('Edit this layout as a draft').props.onClick());
 expect(mocks.standard).not.toHaveBeenCalled();expect(validateForPublish(mocks.custom.mock.calls[0][0].initialState).valid).toBe(true);
});
test('entry names survive resizing and invalid counts cannot advance',()=>{
 prepare(4);const count=()=>tree.root.findByProps({type:'number'});
 act(()=>count().props.onChange({target:{value:'2'}}));act(()=>count().props.onChange({target:{value:'4'}}));
 expect(tree.root.findByProps({'aria-label':'Entry 4'}).props.value).toBe('Entry 4');
 act(()=>count().props.onChange({target:{value:'101'}}));expect(button('Review matchups').props.disabled).toBe(true);
});
test('download dialog retains both formats and separates own picks from blank exports',()=>{
 const state=vi.fn(),blank=vi.fn();act(()=>{tree=create(<BracketDownloads title="Movies" getState={state} getBlankState={blank}/>);});
 expect(tree.root.findAllByType('button')).toHaveLength(1);act(()=>button('Download').props.onClick());
 for(const label of ['PNG','PDF'])expect(tree.root.findAllByType('button').filter(b=>b.children.includes(label))).toHaveLength(2);
 expect(state).not.toHaveBeenCalled();expect(blank).not.toHaveBeenCalled();
});
