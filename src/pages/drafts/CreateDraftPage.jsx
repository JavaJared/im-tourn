import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createDraft, TIMER_OPTIONS, MAX_ROUNDS } from '../../services/draftService';

export const CreateDraftPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [rounds, setRounds] = useState(3);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title'); return; }
    if (rounds < 1 || rounds > MAX_ROUNDS) { setError(`Rounds must be 1–${MAX_ROUNDS}`); return; }
    setCreating(true); setError('');
    try {
      const { id } = await createDraft({
        title: title.trim(), description: description.trim(),
        category: category.trim(), rounds,
        timerSeconds, hostId: currentUser.uid,
        hostDisplayName: currentUser.displayName || 'Anonymous',
      });
      onNavigate(`draft-${id}`);
    } catch (e) { setError(e.message); setCreating(false); }
  };

  return (
    <div className="home-container">
      <div className="page-header"><h1>Create Draft</h1><p>Set up a live snake draft for your group.</p></div>
      <div className="create-pool-form">
        <div className="form-group">
          <label>Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder='e.g. "Oscar 2027 Winners"' maxLength={100} />
        </div>
        <div className="form-group">
          <label>Category (optional)</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Movies, Sports, Music" maxLength={40} />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Rules, context, or notes for participants..." maxLength={500} rows={3} />
        </div>
        <div className="draft-settings-row">
          <div className="form-group">
            <label>Rounds</label>
            <input type="number" value={rounds} onChange={e => setRounds(parseInt(e.target.value) || 1)}
              min={1} max={MAX_ROUNDS} className="draft-number-input" />
          </div>
          <div className="form-group">
            <label>Pick Timer</label>
            <select value={timerSeconds} onChange={e => setTimerSeconds(parseInt(e.target.value))}
              className="filter-select">
              {TIMER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button className="btn-secondary" onClick={() => onNavigate('drafts')} disabled={creating}>Cancel</button>
          <button className="nav-btn" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};
