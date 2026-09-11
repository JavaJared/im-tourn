import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import MyActivitiesPage from '../src/pages/activities/MyActivitiesPage';
const mocks = vi.hoisted(() => ({ user:{uid:'alice'}, catalog:{}, callServer:vi.fn() }));
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({currentUser:mocks.user})}));
vi.mock('../src/lib/usePagedCatalog',()=>({usePagedCatalog:()=>mocks.catalog}));
vi.mock('../src/services/bracketService',()=>({getBracketById:vi.fn()}));
vi.mock('../src/services/server',()=>({callServer:(...args)=>mocks.callServer(...args)}));
vi.mock('../src/components/dialogs/AuthModal',()=>({default:()=>null}));
let tree;
beforeEach(()=>{mocks.user={uid:'alice'};mocks.catalog={items:[],loading:false,error:'',hasMore:false,refresh:vi.fn(),loadMore:vi.fn()};mocks.callServer.mockReset();});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
const mount = props => { act(()=>{tree=create(createElement(MyActivitiesPage,props));}); return tree; };
test('signed-out visitors get a login prompt instead of an account list',()=>{
 mocks.user=null;mount({});expect(JSON.stringify(tree.toJSON())).toContain('Sign in to find');
});
test('attention filter shows actionable items and buttons navigate to their activity',()=>{
 const navigate=vi.fn();mocks.catalog.items=[{id:'p',catalogType:'joinedPools',title:'Pool',category:'pools',needsAttention:true,action:'Make predictions',destination:'pool-p',createdAtMs:1000},{id:'b',catalogType:'brackets',title:'Old bracket',category:'brackets',action:'Fill bracket',createdAtMs:500}];
 mount({onNavigate:navigate});act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Needs attention')).props.onClick());
 expect(tree.root.findAllByType('article')).toHaveLength(1);
 act(()=>tree.root.findAllByType('button').find(b=>b.props.className==='back-btn'&&b.children.includes('Make predictions')).props.onClick());expect(navigate).toHaveBeenCalledWith('pool-p');
});
test('reopens a saved submission without resubmitting or modifying it',async()=>{
 const show=vi.fn();mocks.catalog.items=[{id:'s',catalogType:'submissions',title:'Saved',category:'saved',action:'View saved bracket',submissionId:'s',createdAtMs:1000}];
 mocks.callServer.mockResolvedValue({id:'s',title:'Saved',matchups:JSON.stringify([[{entry1:{name:'A'},entry2:{name:'B'},winner:1}]])});mount({onViewSaved:show});
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('View saved bracket')).props.onClick());
 expect(show).toHaveBeenCalledWith(expect.objectContaining({id:'s',title:'Saved',matchups:expect.any(Array)}));
 expect(mocks.callServer).toHaveBeenCalledWith('getMySavedActivity',{type:'standard',id:'s'});
});
