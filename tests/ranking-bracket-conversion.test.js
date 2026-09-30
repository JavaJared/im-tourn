import { test } from 'vitest';
import { createRequire } from 'node:module';
import { generateSeededBracket } from '../src/lib/standardBracket';
import { serialize } from '../src/lib/customBracketCodec';
const require = createRequire(import.meta.url);
const { createHandler } = require('../functions/ranking-bracket-core');

const check = (value, message) => { if (!value) throw new Error(message); };
class ApiError extends Error { constructor(code,message){super(message);this.code=code;} }
function fixture() {
 const entries=['a','b','c','d','e'].map((id,index)=>({id,rankingId:'r',text:'Entry '+id,index}));
 const records = new Map([
  ['rankings/r',{hostId:'host',status:'open',title:'Movies',entryCount:5,voteCount:2,consensusRanking:JSON.stringify(entries.map((entry,i)=>({id:entry.id,score:5-i})))}],
  ['rankingVotes/r_alice',{rankingId:'r',userId:'alice',ranking:JSON.stringify(['e','d','c','b','a'])}],
 ]);
 const doc = path=>({path,id:path.split('/').at(-1)});
 const writes=[];
 const db={doc,collection:()=>({where:()=>({limit:()=>({query:true})})}),
  runTransaction:async fn=>fn({get:async ref=>ref.query?{docs:entries.map(entry=>({id:entry.id,data:()=>entry}))}:{exists:records.has(ref.path),data:()=>records.get(ref.path)},
    set:(ref,value)=>{writes.push(ref.path);records.set(ref.path,value);}})};
 const handler=createHandler({db,stamp:()=>123,hash:value=>value.replaceAll(':','-'),HttpsError:ApiError,generateSeededBracket,serialize});
 const request=(uid='alice',mode='personal',extra={})=>({auth:{uid},data:{rankingId:'r',mode,requestId:'operation-1',...extra}});
 return {handler,records,writes,request,entries};
}
async function rejectsCode(fn,code){
 let error;try{await fn();}catch(reason){error=reason;}
 check(error?.code===code,'Expected '+code+', got '+error?.code);
}
test('personal conversion uses only authenticated saved order and creates a seeded private draft',async()=>{
 const f=fixture(), result=await f.handler(f.request('alice','personal',{userId:'host',ranking:['a','b','c','d','e']}));
 const draft=f.records.get('customBrackets/'+result.bracketId);
 check(draft.status==='draft'&&draft.hostId==='alice','Wrong draft owner/status');
 check(draft.participantCount===5&&draft.roundCount===3,'Wrong size');
 const slots=Object.values(draft.boxes).flatMap(box=>[box.slotA,box.slotB]);
 check(slots.find(slot=>slot.seed===1).name==='Entry e','Not personal order');
 check(slots.filter(slot=>slot.type==='bye').length===3,'Wrong byes');
 check(draft.description.includes('ranking-r'),'Missing source link');
 check(Object.keys(draft.results).length===0,'Unexpected saved results');
});
test('consensus conversion is restricted to set creator',async()=>{
 const f=fixture();
 await rejectsCode(()=>f.handler(f.request('alice','consensus')),'permission-denied');
 check(f.writes.length===0,'Unauthorized write');
 const result=await f.handler(f.request('host','consensus'));
 const slots=Object.values(f.records.get('customBrackets/'+result.bracketId).boxes).flatMap(box=>[box.slotA,box.slotB]);
 check(slots.find(slot=>slot.seed===1).name==='Entry a','Wrong consensus order');
});
test('missing personal vote cannot fall back to someone else or consensus',async()=>{
 const f=fixture();await rejectsCode(()=>f.handler(f.request('host')),'failed-precondition');
 check(f.writes.length===0,'Unauthorized write');
});
test('retries reuse a draft and preserve edits',async()=>{
 const f=fixture(), first=await f.handler(f.request());
 f.records.get('customBrackets/'+first.bracketId).title='Edited title';
 const second=await f.handler(f.request());
 check(first.bracketId===second.bracketId&&f.writes.length===2,'Duplicate draft or quota charge');
 check(f.records.get('customBrackets/'+first.bracketId).title==='Edited title','Retry overwrote edits');
});
test('malformed, stale, and duplicate saved entries are rejected',async()=>{
 for(const ranking of ['bad json',JSON.stringify(['a','b','c','d','d']),JSON.stringify(['a','b'])]){
  const f=fixture();f.records.get('rankingVotes/r_alice').ranking=ranking;
  await rejectsCode(()=>f.handler(f.request()),'failed-precondition');check(f.writes.length===0,'Invalid write');
 }
});
test('consensus ties retain displayed order and no-vote consensus is rejected',async()=>{
 const f=fixture();f.records.get('rankings/r').consensusRanking=JSON.stringify(['c','a','e','b','d'].map(id=>({id,score:3})));
 const result=await f.handler(f.request('host','consensus'));
 check(f.records.get('customBrackets/'+result.bracketId).participants.p1.name==='Entry c','Unstable tie');
 const other=fixture();other.records.get('rankings/r').voteCount=0;
 await rejectsCode(()=>other.handler(other.request('host','consensus')),'failed-precondition');
});
test('authentication, IDs, source status, and daily limit are enforced',async()=>{
 const f=fixture();
 await rejectsCode(()=>f.handler({data:{}}),'unauthenticated');
 await rejectsCode(()=>f.handler(f.request('alice','personal',{rankingId:'bad/path'})),'invalid-argument');
 f.records.get('rankings/r').status='draft';
 await rejectsCode(()=>f.handler(f.request()),'failed-precondition');
 f.records.get('rankings/r').status='closed';
 f.records.set('socialWriteLimits/alice-ranking-brackets',{day:Math.floor(Date.now()/86400000),count:20});
 await rejectsCode(()=>f.handler(f.request()),'resource-exhausted');
 check(f.writes.length===0,'Invalid write');
});
