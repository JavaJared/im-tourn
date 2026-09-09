// src/services/tierService.js
//
// Service layer for the Kristin Tiers feature.
//
// Unlike rankings and pools, tier lists are PRIVATE: every list belongs to
// exactly one user and is never browsable by anyone else. Ownership is
// enforced twice — once here (cheap, so the UI can fail fast with a clear
// message) and once in the Firestore security rules (authoritative).
//
// Data model:
//   tierLists/{listId}   — the whole list lives in one document
//
// A tier list is small and always read/written as a unit (at most ~60 items
// and 32 slot references), so a single doc is a better fit than the
// doc-per-entry layout rankings uses. It also means placement changes are
// one atomic write instead of a fan-out.
//
// Images are stored in Firebase Storage at:
//   tierLists/{ownerId}/{listId}/{itemId}-{suffix}.jpg
//
// Each item carries BOTH `imageUrl` (public download URL for display) AND
// `imagePath` (the Storage path, used for cleanup on delete/reupload) —
// same convention as rankingService.

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase';
import { compressImage } from './rankingService';
import {
  emptyPlacements,
  normalizePlacements,
  defaultTierLabels,
  unassignItem,
  MAX_ITEMS,
  TIER_SHAPE,
} from '../lib/tierList';

const TIER_LISTS_COLLECTION = 'tierLists';

// Re-exported so components can import their image helper from one place.
export { compressImage };

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

/** Stable, collision-resistant id for an item within a list. */
export function makeItemId() {
  return `it_${Date.now().toString(36)}_${randomSuffix()}`;
}

// ============ IMAGE HELPERS ============

/**
 * Upload a compressed image Blob for one item.
 * The random suffix means a re-upload gets a fresh URL, so the CDN can't
 * serve a stale cached version of the old image.
 *
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadItemImage(ownerId, listId, itemId, blob) {
  const path = `tierLists/${ownerId}/${listId}/${itemId}-${randomSuffix()}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(ref);
  return { url, path };
}

/**
 * Delete an uploaded item image by its storage path.
 * Missing files are ignored — the goal is just to ensure the file is gone.
 */
export async function deleteItemImage(path) {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') {
      console.warn('Failed to delete tier item image:', path, err);
    }
  }
}

// ============ INTERNAL ============

/**
 * Read a list and assert the caller owns it.
 * Every mutating function goes through this, so ownership is checked in
 * exactly one place rather than being re-implemented per operation.
 */
async function loadOwnedList(listId, ownerId) {
  const ref = doc(db, TIER_LISTS_COLLECTION, listId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Tier list not found');
  }
  const data = snap.data();
  if (data.ownerId !== ownerId) {
    throw new Error('You do not have access to this tier list');
  }
  return { ref, data };
}

/** Shape a raw Firestore doc into what the UI expects. */
function hydrate(id, data) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    id,
    ownerId: data.ownerId,
    title: data.title || 'Untitled',
    tierLabels:
      Array.isArray(data.tierLabels) && data.tierLabels.length === TIER_SHAPE.length
        ? data.tierLabels
        : defaultTierLabels(),
    items,
    placements: normalizePlacements(data.placements, items),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

// ============ LIST CRUD ============

/**
 * Create an empty tier list. Slot counts are fixed by TIER_SHAPE, so there
 * is nothing to configure beyond the title.
 *
 * @returns {Promise<{id: string}>}
 */
export async function createTierList(ownerId, title) {
  if (!ownerId) throw new Error('You must be logged in');
  const clean = String(title || '').trim();
  if (!clean) throw new Error('Give your tier list a name');
  if (clean.length > 80) throw new Error('Name must be 80 characters or fewer');

  const ref = await addDoc(collection(db, TIER_LISTS_COLLECTION), {
    ownerId,
    title: clean,
    tierLabels: defaultTierLabels(),
    items: [],
    placements: emptyPlacements(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: ref.id };
}

/** All of this user's tier lists, newest first. */
export async function getMyTierLists(ownerId) {
  if (!ownerId) return [];
  const q = query(
    collection(db, TIER_LISTS_COLLECTION),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => hydrate(d.id, d.data()));
}

/** One tier list, with ownership enforced. */
export async function getTierList(listId, ownerId) {
  const { data } = await loadOwnedList(listId, ownerId);
  return hydrate(listId, data);
}

/** Rename the list and/or its three tier labels. */
export async function updateTierListMeta(listId, ownerId, { title, tierLabels }) {
  const { ref } = await loadOwnedList(listId, ownerId);
  const patch = { updatedAt: serverTimestamp() };

  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) throw new Error('Name cannot be empty');
    if (clean.length > 80) throw new Error('Name must be 80 characters or fewer');
    patch.title = clean;
  }

  if (tierLabels !== undefined) {
    if (!Array.isArray(tierLabels) || tierLabels.length !== TIER_SHAPE.length) {
      throw new Error('Expected one label per tier');
    }
    patch.tierLabels = tierLabels.map((l, i) =>
      String(l || '').trim().slice(0, 40) || TIER_SHAPE[i].defaultLabel
    );
  }

  await updateDoc(ref, patch);
}

/**
 * Persist the placement grid. Called on a debounce while the user is
 * arranging items, so it deliberately does the minimum work: one write of
 * one field, no reads beyond the ownership check.
 */
export async function saveTierPlacements(listId, ownerId, placements, expected) {
  const ref = doc(db, TIER_LISTS_COLLECTION, listId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().ownerId !== ownerId) throw new Error('Tier list not found');
    const data = snap.data();
    if (expected && JSON.stringify(data.placements) !== JSON.stringify(expected)) throw new Error('This list changed in another tab. Reload before saving more changes.');
    const next = normalizePlacements(placements, data.items || []);
    tx.update(ref, { placements: next, updatedAt: serverTimestamp() });
    return next;
  });
}

/**
 * Delete a list and every image it owns.
 * Images go first: a failed doc delete leaves an empty-looking list the user
 * can retry on, whereas a deleted doc with surviving images leaks Storage
 * files nothing points at any more.
 */
export async function deleteTierList(listId, ownerId) {
  const { ref, data } = await loadOwnedList(listId, ownerId);
  const items = Array.isArray(data.items) ? data.items : [];

  await Promise.all(
    items.filter((i) => i.imagePath).map((i) => deleteItemImage(i.imagePath))
  );
  await deleteDoc(ref);
}

// ============ ITEM CRUD ============

/**
 * Add an item to the pool.
 *
 * The image is uploaded HERE, on submit — not when the user picks a file in
 * the form. Uploading on file-select orphans a Storage object every time
 * someone chooses a photo and then backs out of the dialog.
 *
 * @param {File|null} imageFile - raw file from an <input type="file">
 * @returns {Promise<object>} the created item
 */
export async function addTierItem(listId, ownerId, { label, imageFile }) {
  const { ref, data } = await loadOwnedList(listId, ownerId);
  const items = Array.isArray(data.items) ? data.items : [];

  const clean = String(label || '').trim();
  if (!clean) throw new Error('Give this item a name');
  if (clean.length > 40) throw new Error('Name must be 40 characters or fewer');
  if (items.length >= MAX_ITEMS) {
    throw new Error(`This list already has the maximum of ${MAX_ITEMS} items`);
  }

  const itemId = makeItemId();
  let uploaded = null;

  if (imageFile) {
    const blob = await compressImage(imageFile);
    uploaded = await uploadItemImage(ownerId, listId, itemId, blob);
  }

  const item = {
    id: itemId,
    label: clean,
    imageUrl: uploaded?.url || null,
    imagePath: uploaded?.path || null,
  };

  try {
    await updateDoc(ref, {
      items: [...items, item],
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // The write failed, so nothing references this image. Clean it up
    // rather than leaving an unreachable file in Storage.
    if (uploaded) await deleteItemImage(uploaded.path);
    throw err;
  }

  return item;
}

/**
 * Edit an item's label and/or replace its image.
 * The old image is deleted only after the new one is safely referenced by
 * the document.
 */
export async function updateTierItem(listId, ownerId, itemId, { label, imageFile, removeImage }) {
  const { ref, data } = await loadOwnedList(listId, ownerId);
  const items = Array.isArray(data.items) ? data.items : [];
  const existing = items.find((i) => i.id === itemId);
  if (!existing) throw new Error('Item not found');

  const next = { ...existing };

  if (label !== undefined) {
    const clean = String(label).trim();
    if (!clean) throw new Error('Name cannot be empty');
    if (clean.length > 40) throw new Error('Name must be 40 characters or fewer');
    next.label = clean;
  }

  let uploaded = null;
  const oldPath = existing.imagePath;

  if (imageFile) {
    const blob = await compressImage(imageFile);
    uploaded = await uploadItemImage(ownerId, listId, itemId, blob);
    next.imageUrl = uploaded.url;
    next.imagePath = uploaded.path;
  } else if (removeImage) {
    next.imageUrl = null;
    next.imagePath = null;
  }

  try {
    await updateDoc(ref, {
      items: items.map((i) => (i.id === itemId ? next : i)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (uploaded) await deleteItemImage(uploaded.path);
    throw err;
  }

  // Safe to drop the old file now that the doc no longer points at it.
  if (oldPath && oldPath !== next.imagePath) {
    await deleteItemImage(oldPath);
  }

  return next;
}

/**
 * Delete an item. This also clears it out of whatever slot it occupied —
 * leaving a dangling id behind would render as a permanently stuck empty-
 * looking slot that can't be clicked.
 */
export async function deleteTierItem(listId, ownerId, itemId) {
  const { ref, data } = await loadOwnedList(listId, ownerId);
  const items = Array.isArray(data.items) ? data.items : [];
  const existing = items.find((i) => i.id === itemId);
  if (!existing) return;

  const remaining = items.filter((i) => i.id !== itemId);
  const placements = unassignItem(
    normalizePlacements(data.placements, items),
    itemId
  );

  await updateDoc(ref, {
    items: remaining,
    placements: normalizePlacements(placements, remaining),
    updatedAt: serverTimestamp(),
  });

  if (existing.imagePath) {
    await deleteItemImage(existing.imagePath);
  }
}
