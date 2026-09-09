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
    <div className="bracket-app">
      <Header onNavigate={setView} currentView={view} />

      <main className="main-content">
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

      <Footer
        onOpenFeedback={() => setShowFeedbackModal(true)}
        onNavigate={setView}
        currentView={view}
      />

      <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />

      {showTour && <GuidedTour onComplete={handleTourComplete} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
