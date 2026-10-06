import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import ShareBracketButton from '../src/components/ShareBracketButton';
import {adoptGuestBracketDraft} from '../src/lib/guestBracketDraft';
import {bracketPdf} from '../src/lib/bracketPdf';
vi.mock('../src/components/ActionDialog',()=>({default:({title,children})=><section role="dialog" aria-label={title}>{children}</section>}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();});
test('shares the public bracket route, never the current saved-result URL',async()=>{
 const share=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{share});
 act(()=>{tree=create(<ShareBracketButton type="custom" bracketId="b" title="Movies"/>);});
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(share).toHaveBeenCalledWith(expect.objectContaining({url:'https://imtourn.com/?view=custom-bracket-b'}));
});
test('fallback exposes copy and email with a stable legacy URL',async()=>{
 const writeText=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{clipboard:{writeText}});
 act(()=>{tree=create(<ShareBracketButton type="legacy" bracketId="old" title="Movies"/>);});
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(tree.root.findByType('input').props.value).toBe('https://imtourn.com/?view=fill-bracket-old');
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('Copy link')).props.onClick());
 expect(writeText).toHaveBeenCalled();expect(tree.root.findByType('a').props.href).toContain('mailto:');
});
test('guest import is explicit and never overwrites account data',()=>{
 const values=new Map([['guest','{"picks":{"m1":"p1"}}']]), session=new Map();
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
 vi.stubGlobal('localStorage',storage(values));vi.stubGlobal('sessionStorage',storage(session));
 expect(adoptGuestBracketDraft('guest','account',false)).toBe(false);
 session.set('bracket-guest-import','guest');expect(adoptGuestBracketDraft('guest','account',true)).toBe(false);
 session.set('bracket-guest-import','guest');expect(adoptGuestBracketDraft('guest','account',false)).toBe(true);
 expect(values.get('account')).toBe(values.get('guest'));
 values.set('account','existing');session.set('bracket-guest-import','guest');
 expect(adoptGuestBracketDraft('guest','account',false)).toBe(false);expect(values.get('account')).toBe('existing');
});
test('PDF has correct byte offsets, image length, and page dimensions',async()=>{
 const jpeg=new Uint8Array([255,216,255,217]);const pdf=bracketPdf(jpeg,1600,900);
 expect(pdf.type).toBe('application/pdf');
 const bytes=new Uint8Array(await pdf.arrayBuffer());const text=Array.from(bytes,b=>String.fromCharCode(b)).join('');
 expect(text).toContain('/MediaBox [0 0 1600.00 900.00]');expect(text).toContain('/Length 4');
 const xref=Number(text.match(/startxref\n(\d+)/)[1]);expect(text.slice(xref,xref+4)).toBe('xref');
 const offsets=text.slice(xref).split('\n').slice(3,8);
 offsets.forEach((line,i)=>expect(text.slice(Number(line.slice(0,10)))).toMatch(new RegExp('^'+(i+1)+' 0 obj')));
});
