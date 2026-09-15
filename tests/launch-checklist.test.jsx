import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import AnalyticsConsent, { analyticsCategory } from '../src/components/AnalyticsConsent';
import { pageMetadata, publicPages } from '../src/lib/pageMetadata';
let tree;
afterEach(()=>{if(tree) act(()=>tree.unmount());tree=null;vi.unstubAllGlobals();});
test('analytics loads only after acceptance, and withdrawal removes it',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});
 vi.stubGlobal('window',{location:{origin:'https://imtourn.com'}});
 vi.stubGlobal('document',{cookie:''});
 act(()=>{tree=create(<AnalyticsConsent view="pool-SECRET" />);});
 expect(tree.root.findAllByType('iframe')).toHaveLength(0);
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Accept analytics')).props.onClick());
 expect(tree.root.findAllByType('iframe')).toHaveLength(1);
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Privacy settings')).props.onClick());
 act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Decline analytics')).props.onClick());
 expect(tree.root.findAllByType('iframe')).toHaveLength(0);
});
test('metadata and analytics never interpolate private resource identifiers',()=>{
 for(const view of ['pool-SECRET','saved-bracket-MINE','custom-bracket-PRIVATE']) {
  expect(analyticsCategory(view)).toBe('other');
  expect(JSON.stringify(pageMetadata(view))).not.toContain(view);
  expect(pageMetadata(view).robots).toBe('noindex,follow');
 }
 for(const view of Object.keys(publicPages)) expect(pageMetadata(view).robots).toBe('index,follow');
});
test('social preview, sitemap and real static 404 are shipped',()=>{
 const html=readFileSync('index.html','utf8');
 expect(html).toContain('og:image'); expect(html).toContain('twitter:card');
 expect(readFileSync('public/social-preview.png').length).toBeLessThan(100000);
 expect(readFileSync('public/sitemap.xml','utf8')).not.toContain('pool-');
 expect(readFileSync('public/404.html','utf8')).toContain('Page Not Found');
 expect(readFileSync('netlify.toml','utf8')).not.toContain('status = 200');
});
test('all installable app icons exist and its create shortcut uses the actual route',()=>{
 const manifest=JSON.parse(readFileSync('public/manifest.json','utf8'));
 for(const icon of [...manifest.icons,...manifest.shortcuts.flatMap(s=>s.icons)]) expect(()=>readFileSync('public'+icon.src)).not.toThrow();
 expect(manifest.shortcuts[0].url).toBe('/?view=create');
});
