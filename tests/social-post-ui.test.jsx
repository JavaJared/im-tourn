import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import PostLikeButton from '../src/pages/feed/PostLikeButton';
import PostComments from '../src/pages/feed/PostComments';
const call=vi.hoisted(()=>vi.fn());
vi.mock('../src/services/server',()=>({callServer:(...args)=>call(...args)}));
vi.mock('../src/services/publicUsernames',()=>({rememberUsername:vi.fn()}));
vi.mock('../src/components/layout/UserLink',()=>({default:({userId})=><span>{userId}</span>}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;call.mockReset();});
test('like failure preserves counts and retry uses an explicit target state',async()=>{
 act(()=>{tree=create(<PostLikeButton post={{id:'p',liked:false,likeCount:2}} uid="alice"/>);});
 call.mockRejectedValueOnce(Error('Offline'));
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(tree.root.findByType('button').props['aria-pressed']).toBe(false);
 expect(tree.root.findByProps({role:'alert'}).children).toContain('Offline');
 call.mockResolvedValueOnce({liked:true,likeCount:3});
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(call).toHaveBeenLastCalledWith('setBracketPostLike',{postId:'p',liked:true});
 expect(tree.root.findByType('button').props['aria-pressed']).toBe(true);
});
test('guests cannot like and can read paginated comments',async()=>{
 act(()=>{tree=create(<PostLikeButton post={{id:'p',likeCount:1}}/>);});
 expect(tree.root.findByType('button').props.disabled).toBe(true);
 act(()=>tree.unmount());tree=null;
 call.mockResolvedValueOnce({items:[{id:'one',userId:'alice',body:'First',createdAtMs:1000}],nextCursor:'next'});
 await act(async()=>{tree=create(<PostComments postId="p" ownerId="alice"/>);});
 expect(tree.root.findAllByType('textarea')).toHaveLength(0);
 call.mockResolvedValueOnce({items:[{id:'two',userId:'bob',body:'Second',createdAtMs:2000}],nextCursor:null});
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(call).toHaveBeenLastCalledWith('listBracketPostComments',{postId:'p',cursor:'next'});
 expect(tree.root.findAllByType('li')).toHaveLength(2);
});
test('comment retry preserves text and idempotency key until success',async()=>{
 call.mockResolvedValueOnce({items:[],nextCursor:null});
 await act(async()=>{tree=create(<PostComments postId="p" ownerId="alice" uid="bob"/>);});
 act(()=>tree.root.findByType('textarea').props.onChange({target:{value:'My comment'}}));
 call.mockRejectedValueOnce(Error('Offline'));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 const first=call.mock.calls.at(-1);
 expect(tree.root.findByType('textarea').props.value).toBe('My comment');
 call.mockResolvedValueOnce({id:'new'}).mockResolvedValueOnce({items:[{id:'new',body:'My comment',userId:'bob',createdAtMs:1000}],nextCursor:null});
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 const attempts=call.mock.calls.filter(([name])=>name==='addBracketPostComment');
 expect(attempts[1]).toEqual(first);
 expect(tree.root.findByType('textarea').props.value).toBe('');
 expect(tree.root.findAllByType('li')).toHaveLength(1);
});

vi.mock('react-dom',()=>({createPortal:children=>children}));
vi.mock('../src/lib/useDialog',()=>({useDialog:()=>({current:null})}));
test('publishing requires an explicit public action and leaves picks on the server',async()=>{
 const {default:PostBracketButton}=await import('../src/pages/feed/PostBracketButton');
 vi.stubGlobal('document',{body:{}});
 try{
  act(()=>{tree=create(<PostBracketButton type="legacy" bracketId="b" submissionId="saved"/>);});
  expect(call).not.toHaveBeenCalled();
  act(()=>tree.root.findByType('button').props.onClick());
  expect(tree.root.findByProps({role:'dialog'}).props['aria-modal']).toBe('true');
  expect(call).not.toHaveBeenCalled();
  act(()=>tree.root.findByType('textarea').props.onChange({target:{value:'A wins'}}));
  call.mockResolvedValueOnce({id:'posted'});
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(call).toHaveBeenCalledExactlyOnceWith('publishBracketPost',{type:'legacy',bracketId:'b',submissionId:'saved',caption:'A wins',publicConsent:true});
  expect(tree.root.findByType('a').props.href).toBe('/?view=feed-post-posted');
  expect(tree.root.findAllByProps({role:'dialog'})).toHaveLength(0);
 }finally{vi.unstubAllGlobals();}
});

test('refreshing a post updates its displayed reaction state',()=>{
 act(()=>{tree=create(<PostLikeButton post={{id:'p',liked:false,likeCount:2}} uid="alice"/>);});
 act(()=>tree.update(<PostLikeButton post={{id:'p',liked:true,likeCount:4}} uid="alice"/>));
 expect(tree.root.findByType('button').props['aria-pressed']).toBe(true);
 expect(tree.root.findByType('button').children).toContain('4 likes');
});
