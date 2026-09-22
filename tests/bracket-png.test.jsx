import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,test,vi} from 'vitest';
import {generateSeededBracket} from '../src/lib/standardBracket';
import {blankPrediction} from '../src/lib/customScoring';
import {setResult} from '../src/lib/customBracket';
import {bracketImageLayout,imagePixelRatio,bracketImageFilename} from '../src/lib/bracketImageLayout';
import BracketBoard,{computeLayout,CARDW,CARDH} from '../src/components/BracketBoard';
import DownloadBracketImage from '../src/components/DownloadBracketImage';
const mocks=vi.hoisted(()=>({export:vi.fn()}));
vi.mock('../src/lib/exportBracketPng',()=>({exportBracketPng:(...args)=>mocks.export(...args)}));
const make=n=>generateSeededBracket(Array.from({length:n},(_,i)=>`Team ${i+1}`));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());mocks.export.mockReset();});
test.each([32,64,100])('large %i-entry images include every matchup once in a shorter two-sided layout',n=>{
 const state=make(n),original=structuredClone(state),layout=bracketImageLayout(state);
 expect(layout.twoSided).toBe(true);
 expect(layout.height).toBeLessThan(computeLayout(state).height);
 expect(Object.keys(layout.positions).sort()).toEqual(Object.keys(state.boxes).sort());
 const boxes=Object.values(layout.positions);
 for(const position of boxes){expect(position.x).toBeGreaterThanOrEqual(0);expect(position.y).toBeGreaterThanOrEqual(0);expect(position.x+CARDW).toBeLessThanOrEqual(layout.width);expect(position.y+CARDH).toBeLessThanOrEqual(layout.height);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   if(boxes[i].x===boxes[j].x)expect(Math.abs(boxes[i].y-boxes[j].y)).toBeGreaterThanOrEqual(CARDH);
 }
 expect(state).toEqual(original);
});
test('small and disconnected layouts keep their original shape',()=>{
 expect(bracketImageLayout(make(8)).twoSided).toBe(false);
 const state=make(32);state.rounds.at(-1).push('extra');state.boxes.extra={...state.boxes[state.rounds.at(-1)[0]],id:'extra'};
 expect(bracketImageLayout(state).twoSided).toBe(false);
});
test('export renders all real cards without mobile navigation and preserves winners',()=>{
 let state=make(32);state=setResult(state,state.rounds[0][0],'p1');
 const html=renderToStaticMarkup(<BracketBoard state={state} nameMap={{}} exportMode layoutOverride={bracketImageLayout(state)}/>);
 expect((html.match(/class="engine-card"/g)||[]).length).toBe(31);
 expect(html).not.toContain('round-navigation');
 expect(html).not.toContain('round-cards');
 expect(html).toContain('Team 1');
 expect(state.boxes[state.rounds[0][0]].result.winnerId).toBe('p1');
 expect(blankPrediction(state).boxes[state.rounds[0][0]].result).toBeNull();
});
test('canvas size stays bounded and filenames are safe',()=>{
 for(const [w,h] of [[1000,1000],[3300,5100],[9000,18000]]){
  const scale=imagePixelRatio(w,h);expect(w*scale).toBeLessThanOrEqual(8192);expect(h*scale).toBeLessThanOrEqual(8192);expect(w*h*scale*scale).toBeLessThanOrEqual(12000001);
 }
 expect(bracketImageFilename('My / bracket?')).toBe('My - bracket-.png');
});
test('image creation reports failures and supports retry without saving picks',async()=>{
 const state=make(4),getState=vi.fn(()=>state);
 mocks.export.mockRejectedValueOnce(new Error('Image unavailable')).mockResolvedValueOnce(undefined);
 await act(async()=>{tree=create(<DownloadBracketImage getState={getState} title="Test"/>);});
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('Image unavailable');
 await act(async()=>tree.root.findByType('button').props.onClick());
 expect(mocks.export).toHaveBeenLastCalledWith(state,'Test');expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(0);
});
