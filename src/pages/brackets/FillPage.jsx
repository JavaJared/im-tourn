import { useEffect, useRef, useState } from 'react';
import {
  clearFillDraft,
  fillDraftKey,
  readFillDraft,
  saveFillDraft,
  selectFillWinner,
} from '../../lib/fillDraft';
import { useAuth } from '../../contexts/AuthContext';
import { submitFilledBracket } from '../../services/bracketService';

const FillPage = (props) => {
  const { currentUser } = useAuth();
  const draftKey = fillDraftKey(props.bracket.id, currentUser?.uid);
  // Remount when the account or source changes; never write an old user's draft into a new scope.
  return (
    <FillEditor
      key={JSON.stringify([draftKey, props.bracket.matchups])}
      {...props}
      currentUser={currentUser}
      draftKey={draftKey}
    />
  );
};

const FillEditor = ({ bracket, onSubmit, onBack, currentUser, draftKey }) => {
  const [draft] = useState(() => readFillDraft(draftKey, bracket.matchups));
  const [matchups, setMatchups] = useState(draft.matchups);
  const [draftStatus, setDraftStatus] = useState(
    draft.restored ? 'Saved picks restored.' : 'Picks save automatically on this device.',
  );
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'FINALS';
    if (remaining === 2) return 'SEMI-FINALS';
    if (remaining === 3) return 'QUARTER-FINALS';
    return `ROUND ${roundIndex + 1}`;
  };

  const handleSelectWinner = (roundIndex, matchIndex, entryNum) => {
    if (submittingRef.current) return;
    const next = selectFillWinner(matchups, roundIndex, matchIndex, entryNum);
    setMatchups(next);
    setDraftStatus(
      saveFillDraft(draftKey, bracket.matchups, next)
        ? 'Picks saved on this device.'
        : 'Your browser could not save these picks. Keep this page open to avoid losing them.',
    );
    setSubmitError('');
  };

  const isComplete = () =>
    matchups.every((round) => round.every((match) => match.winner === 1 || match.winner === 2));

  const getChampion = () => {
    const finalMatch = matchups[matchups.length - 1][0];
    return finalMatch.winner
      ? finalMatch.winner === 1
        ? finalMatch.entry1
        : finalMatch.entry2
      : null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !isComplete()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    const filledBracket = { ...bracket, matchups, champion: getChampion() };
    try {
      if (currentUser) {
        await submitFilledBracket(
          { matchups, champion: filledBracket.champion },
          bracket.id,
          currentUser.uid,
          currentUser.displayName,
        );
      }
    } catch {
      if (!mounted.current) return;
      setSubmitError(
        'Your bracket could not be submitted. Your picks are still here. Check your connection and try again.',
      );
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    clearFillDraft(draftKey);
    if (mounted.current) onSubmit(filledBracket);
  };

  const downloadBlankBracket = async () => {
    const { jsPDF } = await import('jspdf');

    // Create landscape letter PDF
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'letter',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Colors
    const orange = [255, 107, 53];
    const darkGray = [51, 51, 51];
    const mediumGray = [102, 102, 102];
    const borderGray = [180, 180, 180];
    const lightBg = [250, 250, 250];
    const white = [255, 255, 255];

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...darkGray);
    pdf.text(bracket.title, pageWidth / 2, 40, { align: 'center' });

    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...mediumGray);
    pdf.text(`${bracket.category} • ${bracket.size} Entries`, pageWidth / 2, 58, {
      align: 'center',
    });

    // Bracket dimensions
    const blankMatchups = bracket.matchups;
    const numRounds = blankMatchups.length;
    const margin = 30;
    const bracketTop = 80;
    const bracketWidth = pageWidth - margin * 2;
    const bracketHeight = pageHeight - bracketTop - 70;
    const roundWidth = bracketWidth / numRounds;
    const matchupWidth = roundWidth - 15;

    // Calculate matchup height based on number of first round matchups
    const firstRoundCount = blankMatchups[0].length;
    const maxMatchupHeight = Math.min(36, (bracketHeight - 20) / firstRoundCount - 4);
    const matchupHeight = Math.max(24, maxMatchupHeight);
    const entryHeight = matchupHeight / 2;

    // Draw each round
    blankMatchups.forEach((round, roundIndex) => {
      const numMatchups = round.length;
      const roundX = margin + roundIndex * roundWidth + 5;

      // Round title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...mediumGray);
      const roundName = getRoundName(roundIndex, numRounds);
      pdf.text(roundName, roundX + matchupWidth / 2, bracketTop - 5, {
        align: 'center',
      });

      // Calculate total height needed for this round's matchups
      // Each subsequent round needs more spacing to align with previous round
      const firstRoundTotalHeight = firstRoundCount * (matchupHeight + 4);
      const thisRoundSpacing = firstRoundTotalHeight / numMatchups;

      round.forEach((match, matchIndex) => {
        // Center each matchup within its allocated space
        const slotTop = bracketTop + matchIndex * thisRoundSpacing;
        const slotBottom = bracketTop + (matchIndex + 1) * thisRoundSpacing;
        const matchY = slotTop + (thisRoundSpacing - matchupHeight) / 2;

        // Draw single outer matchup box
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(1);
        pdf.setFillColor(...white);
        pdf.rect(roundX, matchY, matchupWidth, matchupHeight, 'FD');

        // Draw divider line between entries (shortened to stay inside box)
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(0.5);
        pdf.line(roundX + 1, matchY + entryHeight, roundX + matchupWidth - 1, matchY + entryHeight);

        // Entry 1 content - only draw if has data
        if (match.entry1) {
          // Seed box
          pdf.setFillColor(...orange);
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.rect(roundX + 3, matchY + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(
            String(match.entry1.seed),
            roundX + 3 + seedSize / 2,
            matchY + entryHeight / 2 + 2,
            { align: 'center' },
          );

          // Name
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(
            match.entry1.name.substring(0, 15),
            roundX + seedSize + 8,
            matchY + entryHeight / 2 + 2,
          );
        }
        // Empty boxes for later rounds - no lines inside

        // Entry 2 content - only draw if has data
        if (match.entry2) {
          // Seed box
          pdf.setFillColor(...orange);
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.rect(
            roundX + 3,
            matchY + entryHeight + (entryHeight - seedSize) / 2,
            seedSize,
            seedSize,
            'F',
          );
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(
            String(match.entry2.seed),
            roundX + 3 + seedSize / 2,
            matchY + entryHeight + entryHeight / 2 + 2,
            { align: 'center' },
          );

          // Name
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(
            match.entry2.name.substring(0, 15),
            roundX + seedSize + 8,
            matchY + entryHeight + entryHeight / 2 + 2,
          );
        }
        // Empty boxes for later rounds - no lines inside

        // Draw connector lines to next round
        if (roundIndex < numRounds - 1) {
          const matchCenterY = matchY + matchupHeight / 2;
          pdf.setDrawColor(...borderGray);
          pdf.setLineWidth(0.75);
          pdf.line(roundX + matchupWidth, matchCenterY, roundX + matchupWidth + 7, matchCenterY);
        }
      });
    });

    // Champion box at bottom
    const champY = pageHeight - 55;
    const champWidth = 180;
    const champX = (pageWidth - champWidth) / 2;

    pdf.setFillColor(...lightBg);
    pdf.rect(champX, champY, champWidth, 35, 'F');
    pdf.setDrawColor(...orange);
    pdf.setLineWidth(2);
    pdf.rect(champX, champY, champWidth, 35, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...mediumGray);
    pdf.text('CHAMPION', pageWidth / 2, champY + 12, { align: 'center' });

    // Blank line for champion name
    pdf.setDrawColor(...borderGray);
    pdf.setLineWidth(0.5);
    pdf.line(champX + 25, champY + 27, champX + champWidth - 25, champY + 27);

    pdf.save(`${bracket.title.replace(/\s+/g, '-')}-blank-bracket.pdf`);
  };

  return (
    <div className="fill-container">
      <div className="fill-header">
        <h1>{bracket.title}</h1>
        <p>Click on entries to select winners for each matchup</p>
        <p role="status">{draftStatus}</p>
        <p className="bracket-author-fill">Created by {bracket.userDisplayName}</p>
        <button className="download-blank-btn" onClick={downloadBlankBracket}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download Blank Bracket
        </button>
      </div>

      <div className="bracket-wrapper">
        {matchups.map((round, roundIndex) => (
          <div key={roundIndex} className="round">
            <div className="round-title">{getRoundName(roundIndex, matchups.length)}</div>
            <div className="matchups-container">
              {round.map((match, matchIndex) => (
                <div key={match.id} className="matchup">
                  <button
                    type="button"
                    disabled={!match.entry1 || submitting}
                    aria-pressed={match.winner === 1}
                    className={`matchup-entry ${!match.entry1 ? 'empty' : ''} ${match.winner === 1 ? 'selected' : ''}`}
                    onClick={() => match.entry1 && handleSelectWinner(roundIndex, matchIndex, 1)}
                  >
                    {match.entry1 ? (
                      <>
                        <span className="entry-seed-small">{match.entry1.seed}</span>
                        <span className="entry-name">{match.entry1.name}</span>
                      </>
                    ) : (
                      <span className="entry-name tbd">TBD</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!match.entry2 || submitting}
                    aria-pressed={match.winner === 2}
                    className={`matchup-entry ${!match.entry2 ? 'empty' : ''} ${match.winner === 2 ? 'selected' : ''}`}
                    onClick={() => match.entry2 && handleSelectWinner(roundIndex, matchIndex, 2)}
                  >
                    {match.entry2 ? (
                      <>
                        <span className="entry-seed-small">{match.entry2.seed}</span>
                        <span className="entry-name">{match.entry2.name}</span>
                      </>
                    ) : (
                      <span className="entry-name tbd">TBD</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isComplete() && (
        <div className="champion-display">
          <div className="champion-label">🏆 CHAMPION 🏆</div>
          <div className="champion-name">{getChampion()?.name}</div>
        </div>
      )}

      {submitError && (
        <p className="error-message" role="alert">
          {submitError}
        </p>
      )}
      {submitting && <p role="status">Saving your bracket. Please keep this page open.</p>}
      {!currentUser && (
        <p>
          Sign in before filling to save a submission to your account. As a guest, you can export
          your picks.
        </p>
      )}
      <div className="submit-section">
        <button className="back-btn" onClick={onBack} disabled={submitting}>
          Cancel
        </button>
        <button
          className="submit-btn"
          disabled={!isComplete() || submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Saving...'
            : submitError
              ? 'Retry Submission →'
              : currentUser
                ? 'Submit Bracket →'
                : 'Export Bracket →'}
        </button>
      </div>
    </div>
  );
};

export default FillPage;
