import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
const require=createRequire(import.meta.url);
const {decision,classify}=require('../functions/arena-moderation');
const categories=['harassment','harassment/threatening','hate','hate/threatening','self-harm','self-harm/intent','self-harm/instructions','sexual','sexual/minors','violence','violence/graphic'];
const clean=()=>({model:'omni-moderation-latest',results:[{flagged:false,categories:Object.fromEntries(categories.map(k=>[k,false])),category_scores:Object.fromEntries(categories.map(k=>[k,0.001]))}]});
describe('automatic comment moderation',()=>{
  it('publishes only a complete, unflagged, low-score result',()=>{expect(decision(clean()).status).toBe('approved');});
  it('holds flagged and uncertain content',()=>{const data=clean();data.results[0].flagged=true;expect(decision(data).reason).toBe('flagged');data.results[0].flagged=false;data.results[0].category_scores.harassment=.45;expect(decision(data).reason).toBe('uncertain');});
  it('fails closed on malformed and incomplete provider responses',()=>{for(const data of [{},{results:[]},{results:[{flagged:false}]}])expect(decision(data).status).toBe('pending');const data=clean();delete data.results[0].categories.hate;expect(decision(data).status).toBe('pending');});
  it('makes no external request without configuration',async()=>{const fetch=vi.fn();expect((await classify('Text',{getKey:async()=>null,fetch})).reason).toBe('not-configured');expect(fetch).not.toHaveBeenCalled();});
  it('holds content during outages, rate limits, and malformed JSON',async()=>{for(const fetch of [async()=>{throw Error('timeout');},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('invalid');}})])expect((await classify('Text',{getKey:async()=>'test-key',fetch})).status).toBe('pending');});
  it('sends only text and model to the moderation endpoint',async()=>{const fetch=vi.fn(async()=>({ok:true,json:async()=>clean()}));expect((await classify('Basketball argument',{getKey:async()=>'test-key',fetch})).status).toBe('approved');const [url,options]=fetch.mock.calls[0];expect(url).toBe('https://api.openai.com/v1/moderations');expect(JSON.parse(options.body)).toEqual({model:'omni-moderation-latest',input:'Basketball argument'});});
});
