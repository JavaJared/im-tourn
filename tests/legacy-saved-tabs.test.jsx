import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import PDFPage from '../src/pages/brackets/PDFPage';
import BracketPickViews from '../src/components/BracketPickViews';
vi.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({currentUser:{uid:'alice'}})}));
vi.mock('../src/components/BracketPickViews',()=>({default:({children,view,onView})=><section><button onClick={()=>onView('friends')}>Friends</button><button onClick={()=>onView('mine')}>My Picks</button>{view==='mine'?children:<p>Friends view</p>}</section>}));
vi.mock('../src/components/LegacyBracketBoard',()=>({default:({matchups})=><div data-winner={matchups[0][0].winner}/> }));
vi.mock('../src/components/DownloadBracketImage',()=>({default:()=> <button>Save PNG</button>}));
vi.mock('../src/pages/feed/PostBracketButton',()=>({default:()=> <button>Post to feed</button>}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());});
const saved={id:'submission',submissionId:'submission',bracketId:'original',title:'Old bracket',matchups:[[{winner:1}]],champion:{name:'A'}};
test('completed legacy brackets retain view tabs using the original bracket ID',()=>{
 act(()=>{tree=create(<PDFPage bracket={saved}/>);});
 expect(tree.root.findByType(BracketPickViews).props).toMatchObject({type:'legacy',bracketId:'original',userId:'alice',view:'mine'});
 expect(tree.root.findByProps({'data-winner':1})).toBeTruthy();
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Friends')).props.onClick());
 expect(tree.root.findAllByProps({'data-winner':1})).toHaveLength(0);
 expect(tree.root.findAllByType('button').some(b=>b.children.includes('Post to feed'))).toBe(false);
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('My Picks')).props.onClick());
 expect(tree.root.findByProps({'data-winner':1})).toBeTruthy();
});
test('snapshots with no source retain saved picks without querying the submission ID',()=>{
 act(()=>{tree=create(<PDFPage bracket={{...saved,bracketId:null}}/>);});
 expect(tree.root.findAllByType(BracketPickViews)).toHaveLength(0);
 expect(tree.root.findByProps({'data-winner':1})).toBeTruthy();
});
