import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
const css=readFileSync('src/styles/stadium/tokens.css','utf8');
const tokens=Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
function luminance(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const l=[luminance(tokens[a]),luminance(tokens[b])].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05);}
test('semantic text and actions meet WCAG AA normal-text contrast',()=>{
 for(const [a,b] of [['ink','surface'],['muted','surface'],['muted','canvas'],['on-brand','brand'],['on-brand','brand-hover'],['on-brand','brand-active'],['brand-hover','brand-soft'],['success','success-soft'],['warning','warning-soft'],['danger','danger-soft'],['accent-ink','accent-soft']])expect(contrast(a,b),`${a} on ${b}`).toBeGreaterThanOrEqual(4.5);
});
test('input boundaries and focus indicators meet non-text contrast',()=>{
 for(const a of ['control-line','focus'])expect(contrast(a,'surface')).toBeGreaterThanOrEqual(3);
});
