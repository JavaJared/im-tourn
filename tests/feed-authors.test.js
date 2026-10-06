import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,test,vi} from 'vitest';
function fixture(){
 const getAll=vi.fn(async()=>[{id:'alice',data:()=>({username:'alice',photoURL:'https://firebasestorage.googleapis.com/v0/b/test/o/profile',email:'private@example.com'})}]);
 const db={getAll,doc:path=>({path})},exports={};
 runInNewContext(readFileSync('functions/public-usernames.js','utf8'),{exports,require:name=>name==='firebase-admin/firestore'?{getFirestore:()=>db}:{onCall:fn=>fn,HttpsError:Error}});
 return {resolve:exports.internal.resolveFeedAuthors,getAll};
}
test('signed-in feed returns only permitted fields in a deduplicated batch',async()=>{
 const {resolve,getAll}=fixture();expect(await resolve(['alice','alice','../private'],true)).toEqual({usernames:{alice:'alice'},photos:{alice:'https://firebasestorage.googleapis.com/v0/b/test/o/profile'}});
 expect(getAll.mock.calls[0]).toHaveLength(2);expect(getAll.mock.calls[0][1]).toEqual({fieldMask:['username','photoURL']});
});
test('guest feed does not request or expose profile photos',async()=>{
 const {resolve,getAll}=fixture();expect((await resolve(['alice'],false)).photos).toEqual({});expect(getAll.mock.calls[0][1]).toEqual({fieldMask:['username']});
});
