import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import ViewLink from '../src/components/layout/ViewLink';
import HomePage from '../src/pages/brackets/HomePage';
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({currentUser: null}) }));
vi.mock('../src/services/bracketService', () => ({getBracketById: vi.fn()}));
vi.mock('../src/components/dialogs/SubmissionsModal.jsx', () => ({default: () => null}));
vi.mock('../src/components/CatalogControls', () => ({default: () => null}));
vi.mock('../src/lib/usePagedCatalog', () => ({usePagedCatalog: () => ({
  loading: false, items: [{id:'1', catalogType:'custom', isCustom:true, title:'Movies', category:'Film', size:8}]
})}));
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); });
test('navigation supports keyboard activation and preserves modified native links', () => {
 const navigate=vi.fn();
 act(() => {tree=create(<ViewLink view="pools" currentView="pools" onNavigate={navigate}>Pools</ViewLink>);});
 const link=tree.root.findByType('a');
 expect(link.props.href).toBe('/?view=pools');
 expect(link.props['aria-current']).toBe('page');
 const preventDefault=vi.fn();
 link.props.onClick({button:0,preventDefault});
 expect(navigate).toHaveBeenCalledWith('pools');
 for (const modifiers of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]) {
  navigate.mockClear(); preventDefault.mockClear();
  link.props.onClick({button:0,preventDefault,...modifiers});
  expect(navigate).not.toHaveBeenCalled(); expect(preventDefault).not.toHaveBeenCalled();
 }
});
test('browse search is named, filters work, and category badges stay noninteractive', () => {
 act(() => {tree=create(<HomePage onNavigate={vi.fn()} onFillOut={vi.fn()}/>);});
 const root=tree.root;
 expect(root.findByProps({role:'search'}).props['aria-label']).toBe('Brackets');
 const input=root.findByType('input');
 expect(input.props.type).toBe('search');
 expect(input.props['aria-label']).toBe('Search brackets');
 expect(root.findAllByType('select').every(s => s.props['aria-label'])).toBe(true);
 expect(root.findByProps({className:'bracket-category'}).props.onClick).toBeUndefined();
 expect(root.findByType('h2').children).toContain('BROWSE BRACKETS');
 for (const svg of root.findAllByType('svg')) expect(svg.props['aria-hidden']).toBe('true');
 act(() => input.props.onChange({target:{value:'missing'}}));
 expect(root.findAllByProps({className:'bracket-card'})).toHaveLength(0);
 act(() => root.findByProps({'aria-label':'Clear search'}).props.onClick());
 expect(root.findAllByProps({className:'bracket-card'})).toHaveLength(1);
});
