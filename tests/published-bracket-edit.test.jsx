import React from 'react';
import { act,create } from 'react-test-renderer';
import { test,expect,vi,afterEach } from 'vitest';
import EditPublishedBracket from '../src/components/EditPublishedBracket';
const call=vi.hoisted(()=>vi.fn());
vi.mock('../src/services/server',()=>({callServer:(...args)=>call(...args)}));
vi.mock('../src/components/ActionDialog',()=>({default:({children})=><section>{children}</section>}));
let tree;afterEach(()=>{if(tree)act(()=>tree.unmount());vi.clearAllMocks();});
const button=text=>tree.root.findAllByType('button').find(b=>b.children.includes(text));
async function open(onSaved=vi.fn()){
 call.mockResolvedValueOnce({details:{title:'Original',description:'Description',category:'Movies'},version:'1:0'});
 act(()=>{tree=create(<EditPublishedBracket type="custom" bracketId="one" onSaved={onSaved}/>);});
 await act(async()=>button('Edit bracket').props.onClick());
}
test('metadata failures retain changes for retry and successful saves refresh the title',async()=>{
 const onSaved=vi.fn();await open(onSaved);
 act(()=>tree.root.findAllByType('input')[0].props.onChange({target:{value:'Updated'}}));
 call.mockRejectedValueOnce(Error('Offline'));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(tree.root.findByProps({role:'alert'}).children).toContain('Offline');
 expect(tree.root.findAllByType('input')[0].props.value).toBe('Updated');
 call.mockResolvedValueOnce({saved:true});await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(onSaved).toHaveBeenCalledWith({title:'Updated',description:'Description',category:'Movies'});
 expect(call.mock.calls.at(-1)[1]).toMatchObject({action:'save',expectedVersion:'1:0'});
});
test('structural edits create a separate draft and reuse their request ID on retry',async()=>{
 await open();call.mockRejectedValueOnce(Error('Try again'));
 await act(async()=>button('Edit entries or matchups').props.onClick());const first=call.mock.calls.at(-1)[1];
 call.mockResolvedValueOnce({bracketId:'new-draft'});await act(async()=>button('Edit entries or matchups').props.onClick());
 expect(call.mock.calls.at(-1)[1].requestId).toBe(first.requestId);
 expect(first.action).toBe('revise');expect(tree.root.findByType('a').props.href).toBe('?view=custom-bracket-new-draft');
});
