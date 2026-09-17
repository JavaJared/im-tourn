import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import FriendsPage from '../src/pages/friends/FriendsPage';
import HomePage from '../src/pages/brackets/HomePage';
import { RankingsBrowsePage } from '../src/pages/rankings/RankingsBrowsePage';
import FriendFilter from '../src/pages/friends/FriendFilter';
import FriendActivityDialog from '../src/pages/friends/FriendActivityDialog';
import { readView } from '../src/lib/useViewNavigation';
const mocks=vi.hoisted(()=>({user:{uid:'alice'},catalog:vi.fn(),callServer:vi.fn(),items:[]}));
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({currentUser:mocks.user})}));
vi.mock('../src/lib/usePagedCatalog',()=>({usePagedCatalog:(...args)=>mocks.catalog(...args)}));
vi.mock('../src/services/server',()=>({callServer:(...args)=>mocks.callServer(...args)}));
vi.mock('../src/services/bracketService',()=>({getBracketById:vi.fn()}));
vi.mock('../src/components/dialogs/SubmissionsModal',()=>({default:()=>null}));
vi.mock('../src/lib/useDialog',()=>({useDialog:()=>({current:null})}));
let tree;
const mount=async(element)=>act(async()=>{tree=create(element);});
const button=label=>tree.root.findAllByType('button').find(b=>b.children.includes(label));
beforeEach(()=>{
 mocks.user={uid:'alice'};mocks.items=[];mocks.callServer.mockReset();mocks.catalog.mockReset();
 mocks.callServer.mockResolvedValue({code:'ABC123',sections:[{title:'Round 1',choices:['A']}]});
 mocks.catalog.mockImplementation((_types, options)=>({items:options?.endpoint==='listFriends'?mocks.items:[],loading:false,error:'',hasMore:false,refresh:vi.fn(),loadMore:vi.fn()}));
});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
test('Friends has a bookmarkable route and sign-in prompt',async()=>{
 expect(readView('?view=friends')).toBe('friends');mocks.user=null;await mount(<FriendsPage/>);
 expect(JSON.stringify(tree.toJSON())).toContain('Sign in to add friends');expect(mocks.callServer).not.toHaveBeenCalled();
});
test('accept sends recipient action and refreshes the request list',async()=>{
 mocks.items=[{id:'ab',friendId:'bob',displayName:'Bob',status:'pending',incoming:true}];
 await mount(<FriendsPage/>);
 await act(async()=>button('Accept').props.onClick());
 expect(mocks.callServer).toHaveBeenCalledWith('respondToFriend',{friendId:'bob',action:'accept'});
 expect(JSON.stringify(tree.toJSON())).toContain('Friend request accepted.');
});
test('failed request remains actionable with an error message',async()=>{
 await mount(<FriendsPage/>);mocks.callServer.mockRejectedValueOnce(new Error('Request failed'));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(JSON.stringify(tree.toJSON())).toContain('Request failed');
});
test('filter lists accepted friends only',async()=>{
 mocks.items=[{friendId:'bob',displayName:'Bob',status:'accepted'},{friendId:'eve',displayName:'Eve',status:'pending'}];
 await mount(<FriendFilter friendId="" mode="created" onFriendChange={()=>{}} onModeChange={()=>{}}/>);
 expect(tree.root.findAllByType('option').map(o=>o.props.value)).toEqual(['','bob']);
});
test.each([HomePage,RankingsBrowsePage])('browse filters query friend history on the server instead of filtering a public page',async(Page)=>{
 await mount(<Page onNavigate={()=>{}}/>);
 await act(async()=>tree.root.findByType(FriendFilter).props.onFriendChange('bob'));
 await act(async()=>tree.root.findByType(FriendFilter).props.onModeChange('filled'));
 expect(mocks.catalog).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({endpoint:'listFriendActivities',params:{friendId:'bob',mode:'filled'}}));
});
test('saved choices dialog requests the selected friend and renders read-only choices',async()=>{
 await mount(<FriendActivityDialog selection={{title:'Test',activityType:'custom',activityId:'customBrackets/b/submissions/bob'}} friendId="bob" onClose={()=>{}}/>);
 expect(mocks.callServer).toHaveBeenCalledWith('getFriendActivity',{friendId:'bob',type:'custom',activityId:'customBrackets/b/submissions/bob'});
 expect(tree.root.findByProps({role:'dialog'}).props['aria-modal']).toBe('true');
 expect(tree.root.findAllByType('li')[0].children).toEqual(['A']);
 expect(tree.root.findAllByType('input')).toHaveLength(0);
});
