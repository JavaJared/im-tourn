import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createSaveBuffer } from '../src/lib/saveBuffer';
import PickControl from '../src/components/PickControl';
import SaveNotice from '../src/components/SaveNotice';
import { readFileSync } from 'node:fs';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
test('failed writes retain the oldest baseline and newest changes for explicit retry', async () => {
  const first=deferred(), write=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(true), notify=vi.fn();
  const buffer=createSaveBuffer(write,notify), base={a:0}, one={a:1}, two={a:1,b:2};
  const saving=buffer.save(base,one); await Promise.resolve(); buffer.save(one,two);
  first.reject(Error('offline')); expect(await saving).toBe(false);
  expect(buffer.hasPending()).toBe(true); expect(notify).toHaveBeenLastCalledWith('error',expect.any(Error));
  expect(await buffer.retry()).toBe(true); expect(write).toHaveBeenLastCalledWith(base,two); expect(buffer.hasPending()).toBe(false);
});
test('older success cannot report saved while a newer write is outstanding', async () => {
  const first=deferred(), second=deferred(), write=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), notify=vi.fn();
  const buffer=createSaveBuffer(write,notify), a={}, b={a:1}, c={a:2};
  const task=buffer.save(a,b); await Promise.resolve(); buffer.save(b,c); first.resolve(); await Promise.resolve();
  expect(write).toHaveBeenLastCalledWith(b,c); expect(notify).not.toHaveBeenCalledWith('saved');
  second.resolve(); await task; expect(notify).toHaveBeenLastCalledWith('saved');
});
test('picks expose native keyboard buttons and selected state; viewers have no button', () => {
  const html=renderToStaticMarkup(createElement(PickControl,{editable:true,selected:true,label:'Pick A',onPick:()=>{}},'A'));
  expect(html).toContain('<button'); expect(html).toContain('type="button"'); expect(html).toContain('aria-pressed="true"');
  expect(renderToStaticMarkup(createElement(PickControl,{editable:false},'A'))).not.toContain('<button');
});
test('save errors remain announced with an explicit retry; success has no retry', () => {
  expect(renderToStaticMarkup(createElement(SaveNotice,{state:'error',message:'Not saved',onRetry:()=>{}}))).toContain('role="alert"');
  expect(renderToStaticMarkup(createElement(SaveNotice,{state:'saved',message:'Saved',onRetry:()=>{}}))).not.toContain('<button');
});
test('viewport keeps browser zoom enabled', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=/);
});
