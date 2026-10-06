import React from 'react';
import {act,create} from 'react-test-renderer';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {expect,test,vi} from 'vitest';
import {ThumbnailDrawing} from '../src/pages/feed/BracketThumbnail';
const require=createRequire(import.meta.url),S=require('../functions/generated/scoring.cjs');
vi.mock('../src/services/server',()=>({callServer:vi.fn()}));
const matchups=[[{entry1:{name:'A',seed:1},entry2:{name:'B',seed:2},winner:1},{entry1:{name:'C',seed:3},entry2:{name:'D',seed:4},winner:2}],[{entry1:{name:'A',seed:1},entry2:{name:'D',seed:4},winner:1}]];
const source={matchups:JSON.stringify(matchups)};
function loadEndpoint(file,db){
  const exports={};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  runInNewContext(readFileSync(file,'utf8'),{exports,console,require:name=>{
    if(name==='firebase-functions/v2/https')return {onCall:fn=>fn,HttpsError};
    if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{},FieldPath:{documentId:()=> '__name__'}};
    if(name==='firebase-admin/auth')return {};
    if(name==='./generated/scoring.cjs')return S;
    if(name==='./public-usernames')return {internal:{resolveUsernames:async()=>({})}};
    if(name==='./catalog')return {internal:{summary:()=>({})}};
    return require(name);
  }});
  return exports;
}
test('thumbnail endpoint permits public snapshots and rejects drafts, deletions and private sources',async()=>{
  const state=S.compatiblePickState('legacy',source,source);
  const records={'brackets/b':source,'customBrackets/d':{status:'draft'},'bracketPosts/p':{status:'published',snapshot:JSON.stringify(state)},'bracketPosts/gone':{status:'deleted'},'brackets/broken':{matchups:'bad'}};
  const api=loadEndpoint('functions/bracket-thumbnail.js',{doc:path=>({get:async()=>({data:()=>records[path]})})});
  const read=(type,id)=>api.getBracketThumbnail({data:{type,id}});
  const blank=await read('legacy','b');
  expect(Object.values(blank.state.boxes).every(box=>!box.result?.winnerId)).toBe(true);
  expect((await read('post','p')).state).toEqual(state);
  for(const [type,id,code] of [['custom','d','not-found'],['post','gone','not-found'],['legacy','missing','not-found'],['pool','private','invalid-argument'],['legacy','broken','failed-precondition']])await expect(read(type,id)).rejects.toMatchObject({code});
});
test('full thumbnail includes all matchups, both feeder lines and the final',()=>{
  const state=S.compatiblePickState('legacy',source,source),data={state,...S.structureFromState(state)};
  let tree;act(()=>{tree=create(<ThumbnailDrawing data={data} title="Four entries"/>);});
  expect(tree.root.findAllByType('rect')).toHaveLength(3);
  expect(tree.root.findAllByType('path')).toHaveLength(2);
  expect(tree.root.findAllByType('text')).toHaveLength(6);
  expect(tree.root.findByType('svg').props['aria-label']).toContain('Four entries');
  act(()=>tree.unmount());
});
test('guest profile requests do not read private submissions, pool entries or friendship pairs',async()=>{
  const reads=[];
  const empty={docs:[],size:0};
  const query={where(){return this;},select(){return this;},limit(){return this;},count(){return {get:async()=>({data:()=>({count:0})})};},get:async()=>empty};
  const db={doc:path=>{reads.push(path);return {get:async()=>({exists:true,data:()=>path.startsWith('accountProfiles/')?{username:'bob',bio:'Hello',email:'secret'}:{}})};},collection:name=>{reads.push(name);return query;}};
  const api=loadEndpoint('functions/friends.js',db);
  for(const section of ['header',undefined]){
    const result=await api.getUserProfile({data:{profileId:'bob',section}});
    expect(result).toMatchObject({username:'bob',bio:'Hello',canViewPrivate:false,canSendFriendRequest:false,isSelf:false});
    expect(result).not.toHaveProperty('email');expect(result.stats).not.toHaveProperty('poolsJoined');
  }
  expect(reads.some(path=>/submissions|poolEntries|rankingVotes|friendships\//.test(path))).toBe(false);
  await expect(api.listFriendActivities({data:{friendId:'bob',type:'custom',mode:'filled'}})).rejects.toMatchObject({code:'unauthenticated'});
  await expect(api.getFriendActivity({data:{friendId:'bob'}})).rejects.toMatchObject({code:'unauthenticated'});
});
