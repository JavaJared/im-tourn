import { ProfileNavigationContext } from './components/layout/UserLink';
import NativeBridge from './mobile/NativeBridge';
import './mobile/mobile.css';
import AnalyticsConsent from './components/AnalyticsConsent';
import PageMetadata from './components/PageMetadata';
import AppRoutes from './app/AppRoutes.jsx';
import useAppState from './app/useAppState';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/layout/Header.jsx';
import FeedbackModal from './components/dialogs/FeedbackModal.jsx';
import Footer from './components/layout/Footer.jsx';
import GuidedTour from './components/GuidedTour.jsx';
import './App.css';

function AppContent() {
  const {
    view,
    setView,
    currentBracket,
    fillingBracket,
    showFeedbackModal,
    setShowFeedbackModal,
    showTour,
    currentUser,
    handleTourComplete,
    handleFillOut,
    handleSubmitFilled,
  } = useAppState();

  return (
    <ProfileNavigationContext.Provider value={setView}><div className="bracket-app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <NativeBridge />
      <PageMetadata view={view} />
      <Header onNavigate={setView} currentView={view} />

      <main id="main-content" className="main-content" tabIndex={-1}>
        <AppRoutes
          view={view}
          handleFillOut={handleFillOut}
          setView={setView}
          fillingBracket={fillingBracket}
          handleSubmitFilled={handleSubmitFilled}
          currentBracket={currentBracket}
          currentUser={currentUser}
        />
      </main>

      <AnalyticsConsent view={view} />
      <Footer
        onOpenFeedback={() => setShowFeedbackModal(true)}
        onNavigate={setView}
        currentView={view}
      />

      <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />

      {showTour && <GuidedTour onComplete={handleTourComplete} />}
    </div></ProfileNavigationContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
