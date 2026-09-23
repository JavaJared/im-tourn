import React, {useEffect} from 'react';
import {act, create} from 'react-test-renderer';
import {expect, test, vi} from 'vitest';
const mocks = vi.hoisted(()=>({subscribe:vi.fn(),received:vi.fn()}));
vi.mock('../src/services/customBracketService',()=>({subscribeToBracket:(...args)=>mocks.subscribe(...args)}));
vi.mock('../src/components/CustomBracketFill',()=>({default:({bracketId,watchBracket})=>{
  useEffect(()=>watchBracket(bracketId,mocks.received,()=>{}),[bracketId,watchBracket]);
  return <p>Fill</p>;
}}));
import CustomBracketPage from '../src/components/CustomBracketPage';
test('fill reuses the route snapshot and receives live changes without a second subscription',async()=>{
  let emit;
  const stop=vi.fn();
  mocks.subscribe.mockImplementation((_id,callback)=>{emit=callback;return stop;});
  let tree;
  await act(async()=>{tree=create(<CustomBracketPage bracketId="one" onNavigate={()=>{}}/>);});
  const meta={exists:true,raw:{status:'published',hostId:'owner'}};
  await act(async()=>emit({version:2},meta));
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  expect(mocks.received).toHaveBeenCalledWith({version:2},meta);
  await act(async()=>emit({version:3},meta));
  expect(mocks.received).toHaveBeenLastCalledWith({version:3},meta);
  act(()=>tree.unmount());
  expect(stop).toHaveBeenCalledTimes(1);
});
