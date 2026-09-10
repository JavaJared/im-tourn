import PoolBoard from '../src/components/pools/PoolBoard.jsx';
import { convertLegacyMatchups } from '../src/lib/standardBracket';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AppRoutes from '../src/app/AppRoutes.jsx';
import PoolBracketPanel from '../src/pages/pools/PoolBracketPanel.jsx';

vi.mock('../src/app/pages.jsx', async () => {
  const { createElement } = await import('react');
  const names = [
    'HomePage', 'MyBracketsPage', 'CreatePage', 'FillPage', 'PDFPage',
    'WeeklyBracketPage', 'PoolsPage', 'CreatePoolPage', 'PoolDetailPage',
    'PredictionPoolsPage', 'CreatePredictionPoolPage', 'PredictionPoolDetailPage',
    'RankingsBrowsePage', 'CreateRankingPage', 'MyRankingsPage', 'RankingVotePage',
    'RankingDetailPage', 'DraftsBrowsePage', 'CreateDraftPage', 'MyDraftsPage',
    'DraftLobbyPage', 'PrivacyPolicyPage', 'TermsOfServicePage', 'AdminPage',
    'KristinTiersPage', 'KristinTiersDetailPage', 'CustomBracketPage',
  ];
  return Object.fromEntries(names.map(name => [name, props => createElement('section', {
    'data-page': name,
    'data-id': props.poolId || props.rankingId || props.draftId || props.listId || props.bracketId || props.bracket?.id,
  })]));
});

describe('extracted routing', () => {
  it.each([
    ['pool-one-two', 'PoolDetailPage', 'one-two'],
    ['ranking-vote-one-two', 'RankingVotePage', 'one-two'],
    ['ranking-one-two', 'RankingDetailPage', 'one-two'],
    ['kristin-tiers-one-two', 'KristinTiersDetailPage', 'one-two'],
    ['custom-bracket-one-two', 'CustomBracketPage', 'one-two'],
  ])('renders only the matching page for %s and preserves its full ID', (view, page, id) => {
    const html = renderToStaticMarkup(createElement(AppRoutes, { view }));
    expect(html.match(/data-page="[^"]+"/g)).toEqual([`data-page="${page}"`]);
    expect(html).toContain(`data-id="${id}"`);
  });

  it('keeps the in-progress fill separate from the completed export', () => {
    const props = { fillingBracket: { id: 'draft' }, currentBracket: { id: 'completed' } };
    const fill = renderToStaticMarkup(createElement(AppRoutes, { ...props, view: 'fill' }));
    const pdf = renderToStaticMarkup(createElement(AppRoutes, { ...props, view: 'pdf' }));
    expect(fill).toContain('data-page="FillPage" data-id="draft"');
    expect(pdf).toContain('data-page="PDFPage" data-id="completed"');
    expect(renderToStaticMarkup(createElement(AppRoutes, { view: 'fill' }))).not.toContain('FillPage');
  });
});

describe('extracted pool controls', () => {
  const base = {
    pool: { status: 'open' }, entry: {}, currentUser: { uid: 'test-user' },
    activeTab: 'bracket', isHost: false, displayMatchups: [], entries: [],
  };
  const render = props => renderToStaticMarkup(createElement(PoolBracketPanel, { ...base, ...props }));

  it('offers submission only for an unsubmitted entry in the open pool', () => {
    expect(render({})).toContain('Submit Predictions');
    expect(render({ entry: { submittedAt: '2026-09-09' } })).not.toContain('Submit Predictions');
    expect(render({ pool: { status: 'locked' } })).not.toContain('Submit Predictions');
    expect(render({ currentUser: null })).not.toContain('Submit Predictions');
  });

  it('keeps another participant’s bracket read-only, including for the host', () => {
    const html = render({ viewingEntry: { userId: 'other' }, isHost: true, activeTab: 'results' });
    expect(html).not.toContain('Submit Predictions');
    expect(html).not.toContain('Click on entries to set the actual results');
  });
});

it('renders graded pool picks and keyboard controls after the board split', () => {
  const { state } = convertLegacyMatchups([[{ entry1: { name: 'A', seed: 1 }, entry2: { name: 'B', seed: 2 }, winner: 1 }]]);
  const box = state.rounds[0][0], winner = state.boxes[box].result;
  const html = renderToStaticMarkup(createElement(PoolBoard, { state, nameMap: {}, editable: false, official: { [box]: winner === 'p1' ? 'p2' : 'p1' } }));
  expect(html).toContain('A'); expect(html).toContain('B');
  expect(html).not.toContain('role="button"');
});

it('blocks direct draft links while public access is disabled', () => {
  const html = renderToStaticMarkup(createElement(AppRoutes, { view: 'draft-one-two' }));
  expect(html).toContain('not publicly available');
  expect(html).not.toContain('data-page="DraftLobbyPage"');
});
