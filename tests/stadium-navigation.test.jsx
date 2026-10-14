import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';
import { exploreDestinations, creationDestinations, navigationSection } from '../src/components/layout/navigation';
import { readView } from '../src/lib/useViewNavigation';
import { isHiddenView } from '../src/config/app';
import ArenaMatchup from '../src/pages/arena/ArenaMatchup';

test('navigation preserves supported URLs and does not expose disabled or unlisted tools', () => {
  for (const {view} of [...exploreDestinations, ...creationDestinations]) {
    expect(readView(`?view=${view}`)).toBe(view);
    expect(isHiddenView(view)).toBe(false);
    expect(view).not.toContain('kristin-tiers');
  }
  expect(exploreDestinations.some(item => item.view === 'pools')).toBe(true);
  expect(navigationSection('pool-123')).toBe('browse');
  expect(navigationSection('saved-custom-bracket-123')).toBe('browse');
  expect(navigationSection('my-activities')).toBe('my-activities');
  expect(navigationSection('create-ranking')).toBe('create');
});
const room={matchup:['a','b'],candidates:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}],votes:{a:3,b:1},defender:'a'};
test('redesigned matchup keeps vote identity, locked votes and disabled participation intact', () => {
  const vote=vi.fn();let tree;
  try {
    act(()=>{tree=create(<ArenaMatchup room={room} disabled={false} onVote={vote}/>);});
    act(()=>tree.root.findAllByType('button')[1].props.onClick());expect(vote).toHaveBeenCalledWith('b');
    expect(JSON.stringify(tree.toJSON())).toContain('75%');
    act(()=>tree.update(<ArenaMatchup room={room} vote="b" onVote={vote}/>));
    expect(tree.root.findAllByType('button').every(b=>b.props.disabled)).toBe(true);
    expect(tree.root.findAllByType('button')[1].props['aria-pressed']).toBe(true);
    act(()=>tree.update(<ArenaMatchup room={room} disabled onVote={vote}/>));
    expect(tree.root.findAllByType('button').every(b=>b.props.disabled)).toBe(true);
  } finally {if(tree)act(()=>tree.unmount());}
});
