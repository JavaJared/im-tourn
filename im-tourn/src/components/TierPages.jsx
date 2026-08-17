// src/components/TierPages.jsx
//
// UI for the Kristin Tiers feature — a private tier maker where every list
// uses the same fixed 7 / 15 / 10 shape.
//
// Interaction model: TAP AN ITEM, THEN TAP A SLOT.
// HTML5 drag-and-drop does not fire on touch devices without a polyfill or a
// pointer-event reimplementation, and this page is phone-first. Select-then-
// place works identically with a mouse and a thumb, needs no library, and
// gives us swap-on-collision for free (see placeItem in lib/tierList).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  TIER_SHAPE,
  MAX_ITEMS,
  TOTAL_SLOTS,
  emptyPlacements,
  placeItem,
  unassignItem,
  clearTier,
  getUnassignedItems,
  countFilled,
  countFilledInTier,
  findSlotOfItem,
  itemById,
  initialsFor,
} from '../lib/tierList';
import {
  createTierList,
  getMyTierLists,
  getTierList,
  updateTierListMeta,
  saveTierPlacements,
  deleteTierList,
  addTierItem,
  updateTierItem,
  deleteTierItem,
} from '../services/tierService';

// How long to wait after the last placement change before writing to
// Firestore. Long enough to coalesce a burst of taps, short enough that a
// user who arranges a few items and closes the tab keeps their work.
const SAVE_DEBOUNCE_MS = 800;

// ============================================================
// Shared: one item tile (used in slots and in the pool)
// ============================================================

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

// ============================================================
// Index page — the list of your tier lists
// ============================================================

export const KristinTiersPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const mine = await getMyTierLists(currentUser.uid);
        if (!cancelled) setLists(mine);
      } catch (err) {
        console.error('Error loading tier lists:', err);
        if (!cancelled) setError('Could not load your tier lists');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setError('Give your tier list a name');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { id } = await createTierList(currentUser.uid, newTitle);
      setNewTitle('');
      onNavigate(`kristin-tiers-${id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>Kristin Tiers</h1>
          <p>Sort anything into three tiers</p>
        </div>
        <div className="empty-state">
          <p>Log in to build your tier lists</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading tier lists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Kristin Tiers</h1>
        <p>Sort anything into three tiers — {TIER_SHAPE.map(t => t.slots).join(', ')} slots. Only you can see these.</p>
      </div>

      <div className="kt-create-row">
        <input
          type="text"
          className="kt-input"
          placeholder="Name your tier list"
          value={newTitle}
          maxLength={80}
          onChange={(e) => { setNewTitle(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button className="nav-btn" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : '+ New List'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {lists.length === 0 ? (
        <div className="empty-state">
          <p>No tier lists yet. Name one above to get started.</p>
        </div>
      ) : (
        <div className="pools-grid">
          {lists.map((list) => {
            const filled = countFilled(list.placements);
            return (
              <div
                key={list.id}
                className="pool-card"
                onClick={() => onNavigate(`kristin-tiers-${list.id}`)}
              >
                <h3 className="pool-title">{list.title}</h3>
                <p className="pool-bracket">{filled} / {TOTAL_SLOTS} slots filled</p>
                <div className="pool-meta">
                  <span className="pool-host">{list.items.length} item{list.items.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Add / edit item modal
// ============================================================

const ItemModal = ({ open, mode, item, onSave, onClose, busy }) => {
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
      <div className="kt-modal" onClick={(e) => e.stopPropagation()}>
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

// ============================================================
// Editor page
// ============================================================

export const KristinTiersDetailPage = ({ listId, onNavigate }) => {
  const { currentUser } = useAuth();

  const [list, setList] = useState(null);
  const [placements, setPlacements] = useState(emptyPlacements);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Coalesced-flush pattern: the debounce timer reads the LATEST placements
  // out of this ref rather than closing over the value it was scheduled with.
  // Closing over state here is the bug that bites on rapid edits — the timer
  // fires with whatever the grid looked like several taps ago and silently
  // reverts the newer ones.
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const ownerIdRef = useRef(null);

  ownerIdRef.current = currentUser?.uid || null;

  const flush = useCallback(async () => {
    const toSave = pendingRef.current;
    const ownerId = ownerIdRef.current;
    if (!toSave || !ownerId) return;
    pendingRef.current = null;
    setSaveState('saving');
    try {
      await saveTierPlacements(listId, ownerId, toSave);
      setSaveState('idle');
    } catch (err) {
      console.error('Failed to save placements:', err);
      setSaveState('error');
    }
  }, [listId]);

  const queueSave = useCallback((next) => {
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Flush any pending write on unmount so navigating away mid-debounce
  // doesn't drop the last few placements.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current) flush();
  }, [flush]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) { setLoading(false); return undefined; }
    (async () => {
      try {
        const loaded = await getTierList(listId, currentUser.uid);
        if (cancelled) return;
        setList(loaded);
        setPlacements(loaded.placements);
        setTitleDraft(loaded.title);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not load this tier list');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [listId, currentUser]);

  const applyPlacements = (next) => {
    if (next === placements) return;
    setPlacements(next);
    queueSave(next);
  };

  const handleSlotClick = (tierKey, index) => {
    const occupant = placements[tierKey][index];
    if (selectedId) {
      applyPlacements(placeItem(placements, selectedId, tierKey, index));
      setSelectedId(null);
    } else if (occupant) {
      setSelectedId(occupant);
    }
  };

  const handleItemClick = (itemId) => {
    setSelectedId((prev) => (prev === itemId ? null : itemId));
  };

  const handleUnassign = () => {
    if (!selectedId) return;
    applyPlacements(unassignItem(placements, selectedId));
    setSelectedId(null);
  };

  const handleClearTier = (tierKey) => {
    applyPlacements(clearTier(placements, tierKey));
    setSelectedId(null);
  };

  const handleSaveItem = async ({ label, imageFile, removeImage }) => {
    setModalBusy(true);
    try {
      if (modalItem) {
        const updated = await updateTierItem(listId, currentUser.uid, modalItem.id, {
          label, imageFile, removeImage,
        });
        setList((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.id === updated.id ? updated : i)),
        }));
      } else {
        const created = await addTierItem(listId, currentUser.uid, { label, imageFile });
        setList((prev) => ({ ...prev, items: [...prev.items, created] }));
      }
      setModalOpen(false);
      setModalItem(null);
    } finally {
      setModalBusy(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedId) return;
    const item = itemById(list.items, selectedId);
    if (!item) return;
    if (!window.confirm(`Delete "${item.label}"? This also removes its photo.`)) return;
    try {
      await deleteTierItem(listId, currentUser.uid, selectedId);
      setList((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== selectedId) }));
      setPlacements((prev) => unassignItem(prev, selectedId));
      setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete item:', err);
      window.alert('Could not delete that item. Try again.');
    }
  };

  const handleSaveTitle = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === list.title) {
      setTitleDraft(list.title);
      setEditingTitle(false);
      return;
    }
    try {
      await updateTierListMeta(listId, currentUser.uid, { title: clean });
      setList((prev) => ({ ...prev, title: clean }));
    } catch (err) {
      console.error('Failed to rename list:', err);
      setTitleDraft(list.title);
    }
    setEditingTitle(false);
  };

  const handleDeleteList = async () => {
    if (!window.confirm(`Delete "${list.title}" and all of its items? This cannot be undone.`)) return;
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = null;
      await deleteTierList(listId, currentUser.uid);
      onNavigate('kristin-tiers');
    } catch (err) {
      console.error('Failed to delete list:', err);
      window.alert('Could not delete that list. Try again.');
    }
  };

  // ---- render guards (all hooks are above this line) ----

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="empty-state"><p>Log in to view this tier list</p></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading tier list...</p>
        </div>
      </div>
    );
  }

  if (loadError || !list) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>{loadError || 'Tier list not found'}</p>
          <button className="nav-btn" onClick={() => onNavigate('kristin-tiers')}>
            Back to Kristin Tiers
          </button>
        </div>
      </div>
    );
  }

  const unassigned = getUnassignedItems(list.items, placements);
  const selectedItem = itemById(list.items, selectedId);
  const selectedSlot = selectedId ? findSlotOfItem(placements, selectedId) : null;
  const filled = countFilled(placements);

  return (
    <div className="home-container kt-page">
      <div className="page-header kt-header">
        {editingTitle ? (
          <input
            type="text"
            className="kt-input kt-title-input"
            value={titleDraft}
            maxLength={80}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') { setTitleDraft(list.title); setEditingTitle(false); }
            }}
          />
        ) : (
          <h1 className="kt-title" onClick={() => setEditingTitle(true)} title="Click to rename">
            {list.title}
          </h1>
        )}
        <p>
          {filled} / {TOTAL_SLOTS} slots filled
          {saveState === 'saving' && <span className="kt-save-note"> · saving…</span>}
          {saveState === 'error' && <span className="kt-save-error"> · couldn’t save — check your connection</span>}
        </p>
      </div>

      <div className="kt-toolbar">
        <button
          className="nav-btn"
          onClick={() => { setModalItem(null); setModalOpen(true); }}
          disabled={list.items.length >= MAX_ITEMS}
        >
          + Add item
        </button>
        <button className="back-btn" onClick={() => onNavigate('kristin-tiers')}>
          All tier lists
        </button>
        <button className="kt-text-btn kt-danger" onClick={handleDeleteList}>
          Delete list
        </button>
      </div>

      {selectedItem && (
        <div className="kt-action-bar" role="status">
          <span className="kt-action-name">{selectedItem.label}</span>
          <span className="kt-action-hint">selected — tap a slot to place it</span>
          <div className="kt-action-buttons">
            {selectedSlot && (
              <button className="kt-text-btn" onClick={handleUnassign}>Unassign</button>
            )}
            <button
              className="kt-text-btn"
              onClick={() => { setModalItem(selectedItem); setModalOpen(true); }}
            >
              Edit
            </button>
            <button className="kt-text-btn kt-danger" onClick={handleDeleteItem}>Delete</button>
            <button className="kt-text-btn" onClick={() => setSelectedId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {TIER_SHAPE.map((tier, tierIndex) => (
        <div className="kt-tier" key={tier.key}>
          <div className="kt-tier-head">
            <span className="kt-tier-name">{list.tierLabels[tierIndex]}</span>
            <span className="kt-tier-count">
              {countFilledInTier(placements, tier.key)} / {tier.slots}
            </span>
            {countFilledInTier(placements, tier.key) > 0 && (
              <button
                className="kt-text-btn kt-tier-clear"
                onClick={() => handleClearTier(tier.key)}
              >
                Clear
              </button>
            )}
          </div>
          <div className="kt-slots">
            {placements[tier.key].map((itemId, index) => {
              const item = itemById(list.items, itemId);
              return (
                <ItemTile
                  key={`${tier.key}-${index}`}
                  item={item}
                  empty={!item}
                  selected={item ? item.id === selectedId : Boolean(selectedId)}
                  onClick={() => handleSlotClick(tier.key, index)}
                  ariaLabel={
                    item
                      ? `${item.label}, ${list.tierLabels[tierIndex]} slot ${index + 1}`
                      : `Empty ${list.tierLabels[tierIndex]} slot ${index + 1}`
                  }
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="kt-pool">
        <div className="kt-tier-head">
          <span className="kt-tier-name">Unassigned</span>
          <span className="kt-tier-count">{unassigned.length}</span>
        </div>
        <div className="kt-slots kt-pool-slots">
          {unassigned.map((item) => (
            <ItemTile
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onClick={() => handleItemClick(item.id)}
              ariaLabel={`${item.label}, unassigned`}
            />
          ))}
          {list.items.length < MAX_ITEMS && (
            <ItemTile
              empty
              selected={false}
              onClick={() => { setModalItem(null); setModalOpen(true); }}
              ariaLabel="Add a new item"
            />
          )}
          {unassigned.length === 0 && list.items.length > 0 && (
            <p className="kt-pool-empty">Everything is placed.</p>
          )}
        </div>
      </div>

      <ItemModal
        open={modalOpen}
        mode={modalItem ? 'edit' : 'add'}
        item={modalItem}
        busy={modalBusy}
        onSave={handleSaveItem}
        onClose={() => { if (!modalBusy) { setModalOpen(false); setModalItem(null); } }}
      />
    </div>
  );
};
