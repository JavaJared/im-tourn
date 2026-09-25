import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import UsernameReminder from '../src/components/account/UsernameReminder';
vi.mock('react-dom',()=>({createPortal:children=>children}));
vi.mock('../src/lib/useDialog',()=>({useDialog:()=>({current:null})}));
let tree,storage;
const account={username:'user_default',usernameIsDefault:true};
beforeEach(()=>{storage=new Map();vi.stubGlobal('document',{body:{}});vi.stubGlobal('sessionStorage',{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});});
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;vi.unstubAllGlobals();});
test('only freshly verified default usernames receive the prompt',()=>{
 for(const value of [{...account,loading:true},{...account,error:'offline'},{username:'chosen',usernameIsDefault:false},{needsUsername:true}]){
  act(()=>{tree=create(<UsernameReminder userId="alice" account={value}/>);});expect(tree.toJSON()).toBeNull();act(()=>tree.unmount());
 }
 act(()=>{tree=create(<UsernameReminder userId="alice" account={account}/>);});expect(tree.root.findByProps({role:'dialog'})).toBeTruthy();
});
test('dismissal persists for this account in the session without hiding other users prompts',()=>{
 act(()=>{tree=create(<UsernameReminder key="alice" userId="alice" account={account}/>);});
 act(()=>tree.root.findAllByType('button').find(button=>button.children.includes('Maybe later')).props.onClick());expect(tree.toJSON()).toBeNull();
 act(()=>tree.unmount());act(()=>{tree=create(<UsernameReminder key="alice" userId="alice" account={account}/>);});expect(tree.toJSON()).toBeNull();
 act(()=>tree.update(<UsernameReminder key="bob" userId="bob" account={account}/>));expect(tree.root.findByProps({role:'dialog'})).toBeTruthy();
});
test('failed username claims stay open for retry and successful saves dismiss the prompt',async()=>{
 const save=vi.fn().mockRejectedValueOnce(Error('That username is taken.')).mockResolvedValueOnce({username:'chosen',usernameIsDefault:false});
 act(()=>{tree=create(<UsernameReminder userId="alice" account={account} onSave={save}/>);});
 act(()=>tree.root.findByType('input').props.onChange({target:{value:'chosen'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(tree.root.findByProps({role:'alert'}).children).toContain('That username is taken.');
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(save).toHaveBeenLastCalledWith('chosen');expect(tree.toJSON()).toBeNull();
});
