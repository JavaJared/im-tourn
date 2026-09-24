import {createRequire} from 'node:module';
import {expect,test} from 'vitest';
const {rankFeed}=createRequire(import.meta.url)('../functions/feed-ranking.cjs');
const now=1700000000000;
const item=(id,category='Movies',userId=id,type='legacy')=>({id,type,category,userId,createdAtMs:now});
test('interests and friends personalize identical candidates without exposing scores',()=>{
 const candidates=[item('sports','Sports Teams'),item('movies'),item('friend','Books','bob')];
 expect(rankFeed(candidates,{categories:{movies:5}} ,now)[0].id).toBe('movies');
 expect(rankFeed(candidates,{friends:new Set(['bob'])},now)[0]).toMatchObject({id:'friend',reason:'From a friend'});
 expect(rankFeed(candidates,{},now)[0]).not.toHaveProperty('score');
});
test('hidden items disappear, completed items fall behind new discoveries, and creator repetition is reduced',()=>{
 const candidates=[item('a','Movies','same'),item('b','Movies','same'),item('c','Movies','other'),item('done'),item('hidden')];
 const result=rankFeed(candidates,{hidden:new Set(['legacy:hidden']),completed:new Set(['legacy:done'])},now);
 expect(result.map(x=>x.id)).toEqual(['a','c','b','done']);
 expect(result.at(-1).completed).toBe(true);
 expect(candidates).toHaveLength(5);
});
test('guests get deterministic recent discoveries and both content types',()=>{
 const candidates=[item('old'),item('new','Books','writer','ranking')];candidates[0].createdAtMs-=86400000*100;
 expect(rankFeed(candidates,{},now).map(x=>x.id)).toEqual(['new','old']);
});

test('friends public picks get a boost and hidden posts are omitted',()=>{
 const candidates=[item('discover'),item('picks','Movies','bob','post'),item('hidden','Movies','bob','post')];
 const result=rankFeed(candidates,{friends:new Set(['bob']),hidden:new Set(['post:hidden'])},now);
 expect(result[0]).toMatchObject({id:'picks',type:'post',reason:'From a friend'});
 expect(result).toHaveLength(2);
});
