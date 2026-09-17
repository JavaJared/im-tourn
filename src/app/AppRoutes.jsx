import { isHiddenView } from '../config/app';
import { Suspense } from 'react';
import BracketUrlPage from '../pages/brackets/BracketUrlPage';
import {
  FriendsPage,
  ProfilePage,
  RankingsBrowsePage,
  CreateRankingPage,
  RankingDetailPage,
  RankingVotePage,
  MyRankingsPage,
  PrivacyPolicyPage,
  TermsOfServicePage,
  DraftsBrowsePage,
  CreateDraftPage,
  DraftLobbyPage,
  MyDraftsPage,
  CustomBracketPage,
  WeeklyBracketPage,
  KristinTiersPage,
  KristinTiersDetailPage,
  HomePage,
  MyBracketsPage,
  MyActivitiesPage,
  PoolsPage,
  CreatePoolPage,
  PoolDetailPage,
  PredictionPoolsPage,
  CreatePredictionPoolPage,
  PredictionPoolDetailPage,
  AdminPage,
  CreatePage,
  FillPage,
  PDFPage,
} from './pages.jsx';

export default function AppRoutes({
  view,
  handleFillOut,
  setView,
  fillingBracket,
  handleSubmitFilled,
  currentBracket,
  currentUser,
}) {
  if (isHiddenView(view)) return <div className="home-container"><p>This feature is not publicly available.</p><button onClick={() => setView('home')}>Back to browse</button></div>;
  return (
    <Suspense
      key={view + ':' + (currentUser?.uid || 'guest')}
      fallback={
        <div role="status" className="loading-state">
          Loading page…
        </div>
      }
    >
      {view === 'not-found' && <section className="home-container"><h1>Page not found</h1><p>This link does not match an available page.</p><button className="nav-btn" onClick={() => setView('home')}>Back to browse</button></section>}
      {view === 'home' && <HomePage onFillOut={handleFillOut} onNavigate={setView} />}
      {view === 'friends' && <FriendsPage key={currentUser?.uid || 'guest'} onNavigate={setView} />}
      {view === 'profile' && <ProfilePage onNavigate={setView} />}
      {view.startsWith('profile-') && <ProfilePage profileId={view.slice('profile-'.length)} onNavigate={setView} />}
      {view === 'my-activities' && <MyActivitiesPage key={currentUser?.uid || 'guest'} onNavigate={setView} onFillOut={handleFillOut} onViewSaved={handleSubmitFilled} />}
      {view === 'my-brackets' && <MyBracketsPage onFillOut={handleFillOut} onNavigate={setView} />}
      {view === 'create' && <CreatePage onNavigate={setView} />}
      {view.startsWith('fill-bracket-') && <BracketUrlPage id={view.slice('fill-bracket-'.length)} mode="fill" onSubmit={handleSubmitFilled} onBack={() => setView('home')} />}
      {view.startsWith('saved-bracket-') && <BracketUrlPage id={view.slice('saved-bracket-'.length)} mode="saved" onBack={() => setView('home')} />}
      {view.startsWith('local-bracket-') && <BracketUrlPage id={view.slice('local-bracket-'.length)} mode="local" fallback={currentBracket} onBack={() => setView('home')} />}
      {view === 'fill' && fillingBracket && (
        <FillPage
          bracket={fillingBracket}
          onSubmit={handleSubmitFilled}
          onBack={() => setView('home')}
        />
      )}
      {view === 'pdf' && currentBracket && (
        <PDFPage bracket={currentBracket} onBack={() => setView('home')} />
      )}
      {view === 'weekly' && <WeeklyBracketPage />}
      {view === 'pools' && <PoolsPage onNavigate={setView} />}
      {view === 'create-pool' && <CreatePoolPage onNavigate={setView} />}
      {view.startsWith('pool-') && !view.startsWith('prediction-pool-') && (
        <PoolDetailPage poolId={view.replace('pool-', '')} onNavigate={setView} />
      )}
      {view === 'prediction-pools' && <PredictionPoolsPage onNavigate={setView} />}
      {view === 'create-prediction-pool' && <CreatePredictionPoolPage onNavigate={setView} />}
      {view.startsWith('prediction-pool-') && (
        <PredictionPoolDetailPage
          poolId={view.replace('prediction-pool-', '')}
          onNavigate={setView}
        />
      )}
      {view === 'rankings' && <RankingsBrowsePage onNavigate={setView} />}
      {view === 'create-ranking' && <CreateRankingPage onNavigate={setView} />}
      {view === 'my-rankings' && <MyRankingsPage onNavigate={setView} />}
      {view.startsWith('ranking-vote-') && (
        <RankingVotePage rankingId={view.replace('ranking-vote-', '')} onNavigate={setView} />
      )}
      {view.startsWith('ranking-') && !view.startsWith('ranking-vote-') && view !== 'rankings' && (
        <RankingDetailPage rankingId={view.replace('ranking-', '')} onNavigate={setView} />
      )}
      {view === 'drafts' && <DraftsBrowsePage onNavigate={setView} />}
      {view === 'create-draft' && <CreateDraftPage onNavigate={setView} />}
      {view === 'my-drafts' && <MyDraftsPage onNavigate={setView} />}
      {view.startsWith('draft-') && view !== 'drafts' && (
        <DraftLobbyPage draftId={view.replace('draft-', '')} onNavigate={setView} />
      )}
      {view === 'privacy' && <PrivacyPolicyPage />}
      {view === 'terms' && <TermsOfServicePage />}
      {view === 'admin' && <AdminPage />}
      {view === 'kristin-tiers' && <KristinTiersPage onNavigate={setView} />}
      {view.startsWith('kristin-tiers-') && (
        <KristinTiersDetailPage listId={view.replace('kristin-tiers-', '')} onNavigate={setView} />
      )}
      {view.startsWith('saved-custom-bracket-') && <CustomBracketPage bracketId={view.replace('saved-custom-bracket-', '')} currentUserId={currentUser?.uid} currentUserName={currentUser?.displayName} onNavigate={setView} openSaved />}
      {view.startsWith('custom-bracket-') && (
        <CustomBracketPage
          bracketId={view.replace('custom-bracket-', '')}
          currentUserId={currentUser?.uid}
          currentUserName={currentUser?.displayName}
          onNavigate={setView}
        />
      )}
    </Suspense>
  );
}
