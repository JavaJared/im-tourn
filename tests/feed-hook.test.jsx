import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import useForYouFeed from '../src/pages/feed/useForYouFeed';
const call=vi.hoisted(()=>vi.fn());
vi.mock('../src/services/server',()=>({callServer:(...args)=>call(...args)}));
vi.mock('../src/services/publicUsernames',()=>({rememberUsername:vi.fn()}));
let tree,value;
function Harness({uid}){value=useForYouFeed(uid);return null;}
afterEach(()=>{if(tree)act(()=>tree.unmount());call.mockReset();});
test('pagination deduplicates and retries the same cursor after a failure',async()=>{
 call.mockResolvedValueOnce({items:[{id:'a',type:'legacy'}],nextCursor:'next'});
 await act(async()=>{tree=create(<Harness uid="paging"/>);});
 call.mockRejectedValueOnce(Error('Offline'));
 await act(async()=>value.loadMore());
 expect(value.items).toHaveLength(1);expect(value.error).toBe('Offline');
 call.mockResolvedValueOnce({items:[{id:'a',type:'legacy'},{id:'b',type:'ranking'}],nextCursor:null});
 await act(async()=>value.loadMore());
 expect(call).toHaveBeenLastCalledWith('getForYouFeed',{cursor:'next'});
 expect(value.items).toHaveLength(2);expect(value.hasMore).toBe(false);
});
test('new account mount discards previous account and late responses',async()=>{
 let finish;
 call.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{tree=create(<Harness key="alice" uid="alice"/>);});
 call.mockResolvedValueOnce({items:[{id:'bob',type:'custom'}],nextCursor:null});
 await act(async()=>tree.update(<Harness key="bob" uid="bob"/>));
 await act(async()=>finish({items:[{id:'alice',type:'custom'}],nextCursor:null}));
 expect(value.items.map(item=>item.id)).toEqual(['bob']);
});
test('hide removes a card and an in-flight refresh cannot put it back',async()=>{
 call.mockResolvedValueOnce({items:[{id:'a',type:'legacy'}],nextCursor:null});
 await act(async()=>{tree=create(<Harness uid="hiding"/>);});
 let finish;
 call.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let refresh;
 act(()=>{refresh=value.refresh();});
 call.mockResolvedValueOnce({ok:true});
 await act(async()=>value.hide({id:'a',type:'legacy'}));
 await act(async()=>{finish({items:[{id:'a',type:'legacy'}],nextCursor:null});await refresh;});
 expect(value.items).toEqual([]);
});

test('unavailable backend gives a useful message and a retry can load cards',async()=>{
 call.mockRejectedValueOnce(Object.assign(Error('internal [0]'),{code:'functions/internal'}));
 await act(async()=>{tree=create(<Harness uid="backend-down"/>);});
 expect(value.error).toContain('temporarily unavailable');
 expect(value.error).not.toContain('internal [0]');
 call.mockResolvedValueOnce({items:[{id:'ready',type:'legacy'}],nextCursor:null});
 await act(async()=>value.loadMore());
 expect(value.error).toBe('');expect(value.items[0].id).toBe('ready');
});

test('public posts survive pagination and refresh after cache invalidation',async()=>{
 const {invalidateFeed}=await import('../src/pages/feed/useForYouFeed');
 call.mockResolvedValueOnce({items:[{id:'posted',type:'post',caption:'My picks'}],nextCursor:null});
 await act(async()=>{tree=create(<Harness uid="posts"/>);});
 expect(value.items[0]).toMatchObject({id:'posted',type:'post'});
 act(()=>tree.unmount());tree=null;invalidateFeed();
 call.mockResolvedValueOnce({items:[],nextCursor:null});
 await act(async()=>{tree=create(<Harness uid="posts"/>);});
 expect(value.items).toEqual([]);
});

test('returning to the feed requests a fresh first page and deprioritizes previous leading cards',async()=>{
 call.mockResolvedValueOnce({items:[{id:'old',type:'legacy'}],nextCursor:'old-page'});
 await act(async()=>{tree=create(<Harness uid="revisit"/>);});
 act(()=>tree.unmount());tree=null;
 call.mockResolvedValueOnce({items:[{id:'fresh',type:'custom'}],nextCursor:'new-page'});
 await act(async()=>{tree=create(<Harness uid="revisit"/>);});
 expect(call).toHaveBeenLastCalledWith('getForYouFeed',{cursor:null,recentlyShown:['legacy:old']});
 expect(value.items.map(x=>x.id)).toEqual(['fresh']);
});

test('clicking For You again refreshes and a failed refresh retries the first page',async()=>{
 const events=new EventTarget();vi.stubGlobal('window',events);
 try {
  call.mockResolvedValueOnce({items:[{id:'a',type:'legacy'}],nextCursor:'old-page'});
  await act(async()=>{tree=create(<Harness uid="nav-refresh"/>);});
  call.mockRejectedValueOnce(Error('Offline'));
  await act(async()=>events.dispatchEvent(new Event('imtourn:refresh-feed')));
  call.mockResolvedValueOnce({items:[{id:'new',type:'post'}],nextCursor:null});
  await act(async()=>value.loadMore());
  expect(call).toHaveBeenLastCalledWith('getForYouFeed',{cursor:null,recentlyShown:['legacy:a']});
  expect(value.items.map(x=>x.id)).toEqual(['new']);
 }finally{if(tree)act(()=>tree.unmount());tree=null;vi.unstubAllGlobals();}
});
