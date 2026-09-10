import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createRanking, compressImage, MAX_RANKING_ENTRIES, MIN_RANKING_ENTRIES } from '../../services/rankingService';

export const CreateRankingPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  // Each entry now has:
  //   id: local React key
  //   text: string
  //   imageBlob: Blob | null   (compressed, awaiting upload)
  //   imagePreviewUrl: string | null  (object URL for preview, revoked on unmount)
  const [entries, setEntries] = useState([
    { id: 'new-0', text: '', imageBlob: null, imagePreviewUrl: null },
    { id: 'new-1', text: '', imageBlob: null, imagePreviewUrl: null },
    { id: 'new-2', text: '', imageBlob: null, imagePreviewUrl: null },
  ]);

  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState(''); // user-facing status text
  const [compressingIndex, setCompressingIndex] = useState(null); // which entry is compressing right now
  const [error, setError] = useState('');
  const fileInputRefs = useRef({});

  // Revoke object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      entries.forEach(e => {
        if (e.imagePreviewUrl) URL.revokeObjectURL(e.imagePreviewUrl);
      });
    };
    // We intentionally don't depend on entries — this is a pure unmount cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addEntry = () => {
    if (entries.length >= MAX_RANKING_ENTRIES) {
      setError(`Maximum of ${MAX_RANKING_ENTRIES} entries`);
      return;
    }
    setEntries([
      ...entries,
      { id: `new-${Date.now()}`, text: '', imageBlob: null, imagePreviewUrl: null },
    ]);
  };

  const removeEntry = (index) => {
    if (entries.length <= MIN_RANKING_ENTRIES) {
      setError(`You need at least ${MIN_RANKING_ENTRIES} entries`);
      return;
    }
    const removed = entries[index];
    if (removed.imagePreviewUrl) URL.revokeObjectURL(removed.imagePreviewUrl);
    setEntries(entries.filter((_, i) => i !== index));
    setError('');
  };

  const updateEntryText = (index, text) => {
    const next = [...entries];
    next[index] = { ...next[index], text };
    setEntries(next);
  };

  const handleImageSelect = async (index, file) => {
    if (!file) return;
    setCompressingIndex(index);
    setError('');
    try {
      // Revoke the old preview URL if there was one
      const old = entries[index];
      if (old.imagePreviewUrl) URL.revokeObjectURL(old.imagePreviewUrl);

      const blob = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);

      setEntries(prev => {
        const next = [...prev];
        next[index] = { ...next[index], imageBlob: blob, imagePreviewUrl: previewUrl };
        return next;
      });
    } catch (err) {
      setError(err.message || 'Failed to process image');
    }
    setCompressingIndex(null);
  };

  const removeImage = (index) => {
    const old = entries[index];
    if (old.imagePreviewUrl) URL.revokeObjectURL(old.imagePreviewUrl);
    const next = [...entries];
    next[index] = { ...next[index], imageBlob: null, imagePreviewUrl: null };
    setEntries(next);
  };

  const handleCreate = async () => {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    const filled = entries.filter(e => e.text.trim());
    if (filled.length < MIN_RANKING_ENTRIES) {
      setError(`Please fill in at least ${MIN_RANKING_ENTRIES} entries`);
      return;
    }

    setCreating(true);

    // Count how many images we'll upload so we can show meaningful status.
    const imageCount = filled.filter(e => e.imageBlob).length;
    if (imageCount > 0) {
      setCreateStatus(`Uploading ${imageCount} image${imageCount === 1 ? '' : 's'}...`);
    } else {
      setCreateStatus('Creating ranking...');
    }

    try {
      // Pass entries with only the fields the service expects.
      const servicePayload = filled.map(e => ({
        text: e.text,
        imageBlob: e.imageBlob,
      }));

      const { id } = await createRanking(
        {
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          hostId: currentUser.uid,
          hostDisplayName: currentUser.displayName || 'Anonymous',
        },
        servicePayload
      );

      // Revoke all preview URLs before navigating away.
      entries.forEach(e => {
        if (e.imagePreviewUrl) URL.revokeObjectURL(e.imagePreviewUrl);
      });

      onNavigate(`ranking-${id}`);
    } catch (err) {
      setError(err.message || 'Failed to create ranking');
      setCreating(false);
      setCreateStatus('');
    }
  };

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Create Ranking</h1>
        <p>Add 3–{MAX_RANKING_ENTRIES} entries. Voters will sort them head-to-head.</p>
      </div>

      <div className="create-pool-form">
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Best Pixar Movies of All Time"
            maxLength={100}
            disabled={creating}
          />
        </div>

        <div className="form-group">
          <label>Category (optional)</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Movies, Music, Sports"
            maxLength={40}
            disabled={creating}
          />
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add context for voters..."
            maxLength={500}
            rows={3}
            disabled={creating}
          />
        </div>

        <div className="form-group">
          <label>Entries ({entries.length}/{MAX_RANKING_ENTRIES})</label>
          <div className="ranking-entries-list">
            {entries.map((entry, index) => (
              <div key={entry.id} className="ranking-entry-row">
                <span className="ranking-entry-number">{index + 1}</span>

                <div className="ranking-entry-image-slot">
                  {compressingIndex === index ? (
                    <div className="ranking-entry-compressing">
                      <div className="spinner-small"></div>
                    </div>
                  ) : entry.imagePreviewUrl ? (
                    <div className="ranking-entry-thumb-wrap">
                      <img src={entry.imagePreviewUrl} alt="" className="ranking-entry-thumb" />
                      <button
                        type="button"
                        className="ranking-entry-remove-img"
                        onClick={() => removeImage(index)}
                        title="Remove image"
                        disabled={creating}
                      >×</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ranking-entry-add-img"
                      onClick={() => fileInputRefs.current[index]?.click()}
                      title="Add image"
                      disabled={creating}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </button>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    ref={el => (fileInputRefs.current[index] = el)}
                    onChange={e => {
                      handleImageSelect(index, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                </div>

                <input
                  type="text"
                  value={entry.text}
                  onChange={e => updateEntryText(index, e.target.value)}
                  placeholder={`Entry ${index + 1}`}
                  maxLength={80}
                  className="ranking-entry-text"
                  disabled={creating}
                />

                <button
                  type="button"
                  className="ranking-entry-delete"
                  onClick={() => removeEntry(index)}
                  title="Remove entry"
                  disabled={entries.length <= MIN_RANKING_ENTRIES || creating}
                >×</button>
              </div>
            ))}
          </div>

          {entries.length < MAX_RANKING_ENTRIES && (
            <button
              type="button"
              className="ranking-add-entry-btn"
              onClick={addEntry}
              disabled={creating}
            >
              + Add Entry
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        {creating && createStatus && (
          <div className="ranking-creating-status">
            <div className="spinner-small"></div>
            <span>{createStatus}</span>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('rankings')}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Ranking'}
          </button>
        </div>
      </div>
    </div>
  );
};
