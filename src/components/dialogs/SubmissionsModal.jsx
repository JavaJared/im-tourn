import { useDialog } from '../../lib/useDialog';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getBracketSubmissions, toggleSubmissionUpvote } from '../../services/bracketService';

const SubmissionsModal = ({ isOpen, onClose, bracket }) => {
  const dialogRef = useDialog(isOpen, onClose);
  const request = useRef(0);
  const [error, setError] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [userUpvotes, setUserUpvotes] = useState({});
  const { currentUser } = useAuth();

  // Reset state when modal closes or bracket changes
  useEffect(() => {
    if (isOpen && bracket) {
      setSelectedSubmission(null);
      setSubmissions([]);
      loadSubmissions();
    }
    if (!isOpen) {
      setSelectedSubmission(null);
      setSubmissions([]);
      setUserUpvotes({});
    }
    return () => { request.current++; };
  }, [isOpen, bracket?.id, currentUser?.uid]);

  const loadSubmissions = async () => {
    const generation = ++request.current;
    setLoading(true); setError('');
    try {
      const data = await getBracketSubmissions(bracket.id);
      if (generation !== request.current) return;
      // Parse matchups for each submission
      let invalid = 0;
      const parsedData = data.flatMap(sub => {
        try {
          const matchups = typeof sub.matchups === 'string' ? JSON.parse(sub.matchups) : sub.matchups;
          if (!Array.isArray(matchups) || !matchups.length || !matchups.every(round => Array.isArray(round) && round.every(match => match && typeof match === 'object'))) throw new Error('Invalid bracket');
          return [{ ...sub, matchups, userDisplayName: typeof sub.userDisplayName === 'string' ? sub.userDisplayName : 'Anonymous', upvotes: Number.isFinite(sub.upvotes) ? sub.upvotes : 0, upvotedBy: Array.isArray(sub.upvotedBy) ? sub.upvotedBy : [] }];
        } catch { invalid++; return []; }
      });
      if (invalid) setError(`${invalid} damaged submission${invalid === 1 ? '' : 's'} could not be displayed. Other submissions are available.`);
      // Sort by upvotes (most first), then by date
      parsedData.sort(
        (a, b) => b.upvotes - a.upvotes || new Date(b.submittedAt) - new Date(a.submittedAt),
      );
      setSubmissions(parsedData);

      // Track which submissions current user has upvoted
      if (currentUser) {
        const upvoted = {};
        parsedData.forEach((sub) => {
          if (sub.upvotedBy?.includes(currentUser.uid)) {
            upvoted[sub.id] = true;
          }
        });
        setUserUpvotes(upvoted);
      }
    } catch (error) {
      if (generation === request.current) setError('Submissions could not be loaded. Please retry.');
    }
    if (generation === request.current) setLoading(false);
  };

  const handleUpvote = async (e, submission) => {
    e.stopPropagation(); // Prevent selecting the submission

    if (!currentUser) {
      alert('Please log in to upvote');
      return;
    }

    const hasUpvoted = userUpvotes[submission.id];

    try {
      const result = await toggleSubmissionUpvote(submission.id, currentUser.uid, hasUpvoted);

      // Update local state
      setSubmissions((prev) => {
        const updated = prev.map((sub) => {
          if (sub.id === submission.id) {
            const newUpvotedBy = hasUpvoted
              ? sub.upvotedBy.filter((id) => id !== currentUser.uid)
              : [...sub.upvotedBy, currentUser.uid];
            return {
              ...sub,
              upvotes: result.upvotes,
              upvotedBy: newUpvotedBy,
            };
          }
          return sub;
        });
        // Re-sort by upvotes
        return updated.sort((a, b) => b.upvotes - a.upvotes);
      });

      setUserUpvotes((prev) => ({
        ...prev,
        [submission.id]: !hasUpvoted,
      }));
    } catch (error) {
      setError('Your vote could not be saved. Please retry.');
    }
  };

  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'Finals';
    if (remaining === 2) return 'Semi-Finals';
    if (remaining === 3) return 'Quarter-Finals';
    return `Round ${roundIndex + 1}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Bracket submissions" className="submissions-modal" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close dialog" className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="submissions-header">
          <h2>Submissions for "{bracket?.title}"</h2>
          <p>
            {submissions.length} {submissions.length === 1 ? 'submission' : 'submissions'}
          </p>
        </div>

        {error && <p role="alert">{error} <button type="button" onClick={loadSubmissions}>Retry</button></p>}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No one has filled out this bracket yet.</p>
          </div>
        ) : (
          <div className="submissions-content">
            {/* Submissions List */}
            <div className="submissions-list">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedSubmission(submission); } }} className={`submission-item ${selectedSubmission?.id === submission.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSubmission(submission)}
                >
                  <div className="submission-top-row">
                    <div className="submission-user">
                      <span className="submission-avatar">
                        {submission.userDisplayName?.[0]?.toUpperCase() || '?'}
                      </span>
                      <div className="submission-info">
                        <span className="submission-name">
                          {submission.userDisplayName || 'Anonymous'}
                        </span>
                        <span className="submission-date">{submission.submittedAt}</span>
                      </div>
                    </div>
                    <button
                      className={`upvote-btn ${userUpvotes[submission.id] ? 'upvoted' : ''}`}
                      onClick={(e) => handleUpvote(e, submission)}
                      title={
                        currentUser
                          ? userUpvotes[submission.id]
                            ? 'Remove upvote'
                            : 'Upvote this submission'
                          : 'Log in to upvote'
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill={userUpvotes[submission.id] ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                      <span>{submission.upvotes}</span>
                    </button>
                  </div>
                  {submission.champion && (
                    <div className="submission-champion">
                      <span className="champion-label">Champion:</span>
                      <span className="champion-pick">{submission.champion.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected Submission Bracket View */}
            {selectedSubmission && (
              <div className="submission-bracket-view">
                <div className="submission-bracket-header">
                  <h3>{selectedSubmission.userDisplayName}'s Picks</h3>
                  {selectedSubmission.champion && (
                    <div className="submission-champion-display">
                      🏆 {selectedSubmission.champion.name}
                    </div>
                  )}
                </div>

                <div className="submission-bracket">
                  {selectedSubmission.matchups.map((round, roundIndex) => (
                    <div key={roundIndex} className="submission-round">
                      <div className="submission-round-title">
                        {getRoundName(roundIndex, selectedSubmission.matchups.length)}
                      </div>
                      <div className="submission-matchups">
                        {round.map((match, matchIndex) => (
                          <div key={`${roundIndex}-${matchIndex}`} className="submission-matchup">
                            <div
                              className={`submission-entry ${match.winner === 1 ? 'winner' : ''}`}
                            >
                              {match.entry1 ? (
                                <>
                                  <span className="submission-seed">{match.entry1.seed}</span>
                                  <span className="submission-entry-name">{match.entry1.name}</span>
                                </>
                              ) : (
                                <span className="submission-entry-name tbd">TBD</span>
                              )}
                            </div>
                            <div
                              className={`submission-entry ${match.winner === 2 ? 'winner' : ''}`}
                            >
                              {match.entry2 ? (
                                <>
                                  <span className="submission-seed">{match.entry2.seed}</span>
                                  <span className="submission-entry-name">{match.entry2.name}</span>
                                </>
                              ) : (
                                <span className="submission-entry-name tbd">TBD</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!selectedSubmission && submissions.length > 0 && (
              <div className="select-submission-prompt">
                <p>← Select a submission to view their picks</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmissionsModal;
