import { useDialog } from '../../lib/useDialog';
import { submitFeedback } from '../../services/feedbackService';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const FeedbackModal = ({ isOpen, onClose }) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackType, setFeedbackType] = useState('bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser?.email) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    setFeedbackError('');
    try {
      await submitFeedback({ type: feedbackType, subject, description, email });
      setSubmitted(true);
    } catch (error) {
      setFeedbackError(error.message || 'Feedback could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFeedbackType('bug');
    setSubject('');
    setDescription('');
    setSubmitted(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        className="feedback-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button aria-label="Close dialog" className="modal-close" onClick={handleClose}>
          ×
        </button>

        {submitted ? (
          <div className="feedback-success">
            <div className="success-icon">✓</div>
            <h2>Thank You!</h2>
            <p>Your feedback has been submitted. We appreciate you helping us improve I'm Tourn!</p>
            <button className="nav-btn" onClick={handleClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2>Send Feedback</h2>
            <p className="feedback-subtitle">
              Help us improve I'm Tourn{!currentUser && ' · Log in to send feedback'}
            </p>
            {feedbackError && <p role="alert">{feedbackError}</p>}

            <form onSubmit={handleSubmit}>
              <div className="feedback-type-selector">
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'bug' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('bug')}
                >
                  🐛 Report Bug
                </button>
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'feature' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('feature')}
                >
                  💡 Feature Request
                </button>
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'other' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('other')}
                >
                  💬 Other
                </button>
              </div>

              <div className="form-group">
                <label>Subject *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    feedbackType === 'bug'
                      ? 'Brief description of the issue'
                      : 'What would you like to see?'
                  }
                  maxLength={200}
                  aria-label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  className="form-textarea"
                  placeholder={
                    feedbackType === 'bug'
                      ? 'Please describe the bug in detail. What did you expect to happen? What actually happened?'
                      : 'Please describe your idea in detail. How would this feature help you?'
                  }
                  maxLength={5000}
                  aria-label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email (optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your@email.com"
                  aria-label="Email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="form-hint">We'll only use this to follow up on your feedback</p>
              </div>

              <button type="submit" className="nav-btn feedback-submit-btn" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
