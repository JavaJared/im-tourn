import { lazy } from 'react';

export const RankingsBrowsePage = lazy(() =>
  import('../pages/rankings/RankingsBrowsePage').then((m) => ({ default: m.RankingsBrowsePage })),
);
export const CreateRankingPage = lazy(() =>
  import('../pages/rankings/CreateRankingPage').then((m) => ({ default: m.CreateRankingPage })),
);
export const RankingDetailPage = lazy(() =>
  import('../pages/rankings/RankingDetailPage').then((m) => ({ default: m.RankingDetailPage })),
);
export const RankingVotePage = lazy(() =>
  import('../pages/rankings/RankingVotePage').then((m) => ({ default: m.RankingVotePage })),
);
export const MyRankingsPage = lazy(() =>
  import('../pages/rankings/MyRankingsPage').then((m) => ({ default: m.MyRankingsPage })),
);
export const PrivacyPolicyPage = lazy(() =>
  import('../components/LegalPages').then((m) => ({ default: m.PrivacyPolicyPage })),
);
export const TermsOfServicePage = lazy(() =>
  import('../components/LegalPages').then((m) => ({ default: m.TermsOfServicePage })),
);
export const DraftsBrowsePage = lazy(() =>
  import('../pages/drafts/DraftsBrowsePage').then((m) => ({ default: m.DraftsBrowsePage })),
);
export const CreateDraftPage = lazy(() =>
  import('../pages/drafts/CreateDraftPage').then((m) => ({ default: m.CreateDraftPage })),
);
export const DraftLobbyPage = lazy(() =>
  import('../pages/drafts/DraftLobbyPage').then((m) => ({ default: m.DraftLobbyPage })),
);
export const MyDraftsPage = lazy(() =>
  import('../pages/drafts/MyDraftsPage').then((m) => ({ default: m.MyDraftsPage })),
);
export const CustomBracketPage = lazy(() => import('../components/CustomBracketPage'));
export const WeeklyBracketPage = lazy(() => import('../components/WeeklyBracketPage'));
export const KristinTiersPage = lazy(() =>
  import('../pages/tiers/KristinTiersPage').then((m) => ({ default: m.KristinTiersPage })),
);
export const KristinTiersDetailPage = lazy(() =>
  import('../pages/tiers/KristinTiersDetailPage').then((m) => ({ default: m.KristinTiersDetailPage })),
);
export { default as HomePage } from '../pages/brackets/HomePage.jsx';
export const MyBracketsPage = lazy(() => import('../pages/brackets/MyBracketsPage.jsx'));
export const PoolsPage = lazy(() => import('../pages/pools/PoolsPage.jsx'));
export const CreatePoolPage = lazy(() => import('../pages/pools/CreatePoolPage.jsx'));
export const PoolDetailPage = lazy(() => import('../pages/pools/PoolDetailPage.jsx'));
export const PredictionPoolsPage = lazy(
  () => import('../pages/predictions/PredictionPoolsPage.jsx'),
);
export const CreatePredictionPoolPage = lazy(
  () => import('../pages/predictions/CreatePredictionPoolPage.jsx'),
);
export const PredictionPoolDetailPage = lazy(
  () => import('../pages/predictions/PredictionPoolDetailPage.jsx'),
);
export const AdminPage = lazy(() => import('../pages/admin/AdminPage.jsx'));
export const CreatePage = lazy(() => import('../pages/brackets/CreatePage.jsx'));
export const FillPage = lazy(() => import('../pages/brackets/FillPage.jsx'));
export const PDFPage = lazy(() => import('../pages/brackets/PDFPage.jsx'));

export const MyActivitiesPage = lazy(() => import('../pages/activities/MyActivitiesPage.jsx'));
