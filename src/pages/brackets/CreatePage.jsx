import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createCustomBracket, createStandardBracket } from '../../services/customBracketService';
import { CATEGORIES } from '../../config/app.js';

const CreatePage = ({ onPublish, onNavigate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [size, setSize] = useState(null);
  const [entries, setEntries] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const { currentUser } = useAuth();

  const handleSizeSelect = (newSize) => {
    setSize(newSize);
    setEntries(
      Array(newSize)
        .fill('')
        .map((_, i) => ({ id: i, name: '' })),
    );
  };

  const startCustom = async () => {
    if (!title.trim() || !currentUser) return;
    try {
      const id = await createCustomBracket({
        hostId: currentUser.uid,
        hostName: currentUser.displayName || null,
        title: title.trim(),
        description,
        category: category || null,
      });
      onNavigate(`custom-bracket-${id}`);
    } catch (e) {
      alert(`Failed to start custom bracket.\n${e.message || 'Please try again.'}`);
    }
  };

  const handleEntryChange = (index, value) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], name: value };
    setEntries(newEntries);
  };

  const isValid = title && category && size && entries.every((e) => e.name.trim());

  const handlePublish = async () => {
    if (!isValid || !currentUser) return;

    setPublishing(true);
    try {
      // UNIFIED WRITE PATH: standard brackets are generated into engine shape
      // and stored alongside custom brackets — one collection, one ruleset,
      // one UI. The legacy `brackets` collection receives no new writes.
      const id = await createStandardBracket({
        hostId: currentUser.uid,
        hostName: currentUser.displayName || 'Anonymous',
        title: title.trim(),
        description,
        category,
        entries,
      });
      onNavigate(`custom-bracket-${id}`);
    } catch (error) {
      console.error('Error publishing bracket:', error);
      alert(`Failed to publish bracket.\n${error.message || 'Please try again.'}`);
    }
    setPublishing(false);
  };

  if (!currentUser) {
    return (
      <div className="create-container">
        <div className="empty-state">
          <p>Please log in to create a bracket.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-container">
      <div className="create-header">
        <h1>CREATE A BRACKET</h1>
        <p>Set up your tournament and add your entries</p>
      </div>

      <div className="form-card">
        <div className="form-group">
          <label className="form-label">Bracket Title *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Best Marvel Movies"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description (Optional)</label>
          <textarea
            className="form-input form-textarea"
            placeholder="Add a short description..."
            maxLength={5000}
            aria-label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category *</label>
          <select
            className="form-input form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Bracket Size *</label>
          <div className="size-options">
            {[4, 8, 16, 32, 64].map((num) => (
              <div
                key={num}
                className={`size-option ${size === num ? 'selected' : ''}`}
                onClick={() => handleSizeSelect(num)}
              >
                <div className="number">{num}</div>
                <div className="label">entries</div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Or build a custom bracket</label>
          <div
            onClick={startCustom}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.03)',
              cursor: title.trim() ? 'pointer' : 'not-allowed',
              opacity: title.trim() ? 1 : 0.5,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Custom bracket</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                Free-form rounds, byes, any shape · up to 100 players
              </div>
            </div>
            <span style={{ fontSize: 18, opacity: 0.6 }}>→</span>
          </div>
          {!title.trim() && (
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
              Add a bracket title above to start a custom bracket.
            </p>
          )}
        </div>

        {size && (
          <div className="entries-section">
            <div className="entries-header">
              <span className="entries-title">ENTRIES</span>
              <span className="entries-count">
                {entries.filter((e) => e.name).length} / {size} filled
              </span>
            </div>
            <div className="entries-list">
              {entries.map((entry, index) => (
                <div key={index} className="entry-row">
                  <div className="entry-seed">{index + 1}</div>
                  <input
                    type="text"
                    className="entry-input"
                    placeholder={`Entry #${index + 1}`}
                    value={entry.name}
                    onChange={(e) => handleEntryChange(index, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="publish-btn" disabled={!isValid || publishing} onClick={handlePublish}>
          {publishing ? 'Publishing...' : 'PUBLISH BRACKET'}
        </button>
      </div>
    </div>
  );
};

export default CreatePage;
