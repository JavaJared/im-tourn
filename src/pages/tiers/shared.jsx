import { useDialog } from '../../lib/useDialog';
import { createWriteQueue } from '../../lib/writeQueue';
import { useState, useEffect } from 'react';
import { initialsFor } from '../../lib/tierList';

const queuePlacement = createWriteQueue();

const SAVE_DEBOUNCE_MS = 800;

const ItemTile = ({ item, selected, onClick, empty, ariaLabel }) => {
  if (empty) {
    return (
      <button
        type="button"
        className={`kt-tile kt-tile-empty ${selected ? 'kt-tile-target' : ''}`}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        <span className="kt-tile-plus" aria-hidden="true">+</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`kt-tile ${selected ? 'kt-tile-selected' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
    >
      <span className="kt-tile-face">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="kt-tile-initials">{initialsFor(item.label)}</span>
        )}
      </span>
      <span className="kt-tile-label">{item.label}</span>
    </button>
  );
};

const ItemModal = ({ open, mode, item, onSave, onClose, busy }) => {
  const dialogRef = useDialog(open, () => { if (!busy) onClose(); });
  const [label, setLabel] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(item?.label || '');
    setFile(null);
    setPreview(item?.imageUrl || null);
    setRemoveImage(false);
    setError('');
  }, [open, item]);

  // Revoke object URLs so picking several photos in a row doesn't leak them.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  const handlePick = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!picked.type.startsWith('image/')) {
      setError('That file is not an image');
      return;
    }
    setError('');
    setRemoveImage(false);
    setFile(picked);
  };

  const submit = async () => {
    if (!label.trim()) {
      setError('Give this item a name');
      return;
    }
    try {
      // Note: the upload happens inside onSave, i.e. on submit — never on
      // file pick — so backing out of this dialog leaves nothing behind.
      await onSave({ label, imageFile: file, removeImage });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="kt-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={mode === 'edit' ? 'Edit item' : 'Add item'} className="kt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'edit' ? 'Edit item' : 'Add item'}</h3>

        <label className="kt-field-label" htmlFor="kt-item-name">Name</label>
        <input
          id="kt-item-name"
          type="text"
          className="kt-input"
          value={label}
          maxLength={40}
          placeholder="e.g. Alyssa"
          onChange={(e) => { setLabel(e.target.value); setError(''); }}
        />

        <label className="kt-field-label" htmlFor="kt-item-image">Photo (optional)</label>
        <div className="kt-image-row">
          <div className="kt-image-preview">
            {preview && !removeImage
              ? <img src={preview} alt="" />
              : <span className="kt-tile-initials">{initialsFor(label)}</span>}
          </div>
          <div className="kt-image-actions">
            <input
              id="kt-item-image"
              type="file"
              accept="image/*"
              onChange={handlePick}
              disabled={busy}
            />
            {(preview && !removeImage) && (
              <button
                type="button"
                className="kt-text-btn"
                onClick={() => { setFile(null); setPreview(null); setRemoveImage(true); }}
                disabled={busy}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="kt-modal-actions">
          <button className="back-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="nav-btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export { queuePlacement, SAVE_DEBOUNCE_MS, ItemTile, ItemModal };
