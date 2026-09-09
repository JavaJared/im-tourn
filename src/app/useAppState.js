import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewNavigation, readSession, saveSession } from '../lib/useViewNavigation';
import { getPoolByJoinCode } from '../services/bracketService';
import { isHiddenView } from '../config/app.js';

export default function useAppState() {
  const [view, setView] = useViewNavigation();
  // Invite links: capture ?pool=CODE from the URL on first load
  const [pendingPoolCode, setPendingPoolCode] = useState(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('pool');
    if (code) {
      setPendingPoolCode(code.trim());
    }
  }, []);

  // Resolve the code to a pool and navigate to it
  useEffect(() => {
    if (!pendingPoolCode) return;
    let cancelled = false;
    (async () => {
      try {
        const pool = await getPoolByJoinCode(pendingPoolCode);
        if (cancelled) return;
        if (pool) {
          setView(`pool-${pool.id}`);
        } else {
          alert(`No pool found for code "${pendingPoolCode}" — it may have been deleted.`);
        }
      } catch (e) {
        console.error('Invite link lookup failed:', e);
      }
      if (!cancelled) setPendingPoolCode(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingPoolCode]);
  useEffect(() => {
    if (isHiddenView(view)) setView('home');
  }, [view]);
  const [currentBracket, setCurrentBracket] = useState(() => readSession('export-bracket'));
  const [fillingBracket, setFillingBracket] = useState(() => readSession('filling-bracket'));
  useEffect(() => {
    saveSession('export-bracket', currentBracket);
  }, [currentBracket]);
  useEffect(() => {
    saveSession('filling-bracket', fillingBracket);
  }, [fillingBracket]);
  useEffect(() => {
    if ((view === 'fill' && !fillingBracket) || (view === 'pdf' && !currentBracket))
      setView('home');
  }, [view, fillingBracket, currentBracket]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const { currentUser } = useAuth();

  // Check if user needs the guided tour (first time signup)
  useEffect(() => {
    if (currentUser) {
      const tourCompleted = localStorage.getItem(`tour_completed_${currentUser.uid}`);
      const isNewUser = currentUser.metadata?.creationTime === currentUser.metadata?.lastSignInTime;

      if (!tourCompleted && isNewUser) {
        // Small delay to let the UI settle after login
        setTimeout(() => setShowTour(true), 500);
      }
    }
  }, [currentUser]);

  const handleTourComplete = () => {
    if (currentUser) {
      localStorage.setItem(`tour_completed_${currentUser.uid}`, 'true');
    }
    setShowTour(false);
  };

  const handleFillOut = (bracket) => {
    setFillingBracket({
      ...bracket,
      matchups: bracket.matchups.map((round) => round.map((match) => ({ ...match }))),
    });
    setView('fill');
  };

  const handleSubmitFilled = (filledBracket) => {
    setCurrentBracket(filledBracket);
    setView('pdf');
  };

  return {
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
  };
}
