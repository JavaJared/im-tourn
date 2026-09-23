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
