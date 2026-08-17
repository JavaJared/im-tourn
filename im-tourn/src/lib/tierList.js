// src/lib/tierList.js
//
// Pure logic for the Kristin Tiers feature. No Firebase, no React — every
// function here takes state in and returns new state out, which makes the
// placement rules unit-testable in isolation from the UI.
//
// Data shapes
// -----------
//   item        { id, label, imageUrl, imagePath }
//   placements  { tier1: [itemId|null x7], tier2: [... x15], tier3: [... x10] }
//
// Placements are FIXED-LENGTH arrays holding item ids (or null for an empty
// slot). Storing them positionally — rather than as a compacted list — means
// slot 5 stays slot 5 even when slots 1–4 are empty. Any item that does not
// appear in `placements` is considered unassigned and renders in the pool.

/**
 * The shape of every tier list. Slot counts are deliberately hard-coded:
 * every list in this feature uses the same 7 / 15 / 10 layout.
 */
export const TIER_SHAPE = [
  { key: 'tier1', slots: 7, defaultLabel: 'Tier 1' },
  { key: 'tier2', slots: 15, defaultLabel: 'Tier 2' },
  { key: 'tier3', slots: 10, defaultLabel: 'Tier 3' },
];

export const TIER_KEYS = TIER_SHAPE.map((t) => t.key);

/** Total placeable slots across all tiers (32). */
export const TOTAL_SLOTS = TIER_SHAPE.reduce((sum, t) => sum + t.slots, 0);

/**
 * How many items a list may hold. Capped a little above TOTAL_SLOTS so there
 * is room to stage a few extras in the unassigned pool without letting the
 * doc grow unbounded (the whole list lives in a single Firestore document).
 */
export const MAX_ITEMS = 60;

/** Look up the slot count for a tier key. Returns 0 for unknown keys. */
export function slotCountFor(tierKey) {
  const tier = TIER_SHAPE.find((t) => t.key === tierKey);
  return tier ? tier.slots : 0;
}

/** A fresh, fully empty placements object. */
export function emptyPlacements() {
  const out = {};
  for (const tier of TIER_SHAPE) {
    out[tier.key] = new Array(tier.slots).fill(null);
  }
  return out;
}

/** Default tier labels, used when a list has never been renamed. */
export function defaultTierLabels() {
  return TIER_SHAPE.map((t) => t.defaultLabel);
}

/**
 * Coerce whatever came back from Firestore into a valid placements object.
 *
 * This guards against three things that would otherwise corrupt the editor:
 *   - missing or wrong-length tier arrays (e.g. a doc written by older code)
 *   - ids referring to items that have since been deleted
 *   - the same item id appearing in two slots (first occurrence wins)
 *
 * @param {object} raw - placements straight from the database
 * @param {Array<{id: string}>} items - the list's current items
 * @returns {object} a valid placements object
 */
export function normalizePlacements(raw, items = []) {
  const validIds = new Set(items.map((i) => i.id));
  const seen = new Set();
  const out = {};

  for (const tier of TIER_SHAPE) {
    const source = Array.isArray(raw?.[tier.key]) ? raw[tier.key] : [];
    const slots = new Array(tier.slots).fill(null);

    for (let i = 0; i < tier.slots; i++) {
      const id = source[i];
      if (typeof id !== 'string') continue;
      if (!validIds.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      slots[i] = id;
    }

    out[tier.key] = slots;
  }

  return out;
}

/** Deep-ish clone of a placements object (arrays are copied, ids are strings). */
function clonePlacements(placements) {
  const out = {};
  for (const tier of TIER_SHAPE) {
    out[tier.key] = (placements?.[tier.key] || new Array(tier.slots).fill(null)).slice();
  }
  return out;
}

/**
 * Find where an item currently sits.
 * @returns {{tierKey: string, index: number}|null} null if unassigned
 */
export function findSlotOfItem(placements, itemId) {
  if (!itemId) return null;
  for (const tier of TIER_SHAPE) {
    const slots = placements?.[tier.key] || [];
    const index = slots.indexOf(itemId);
    if (index !== -1) return { tierKey: tier.key, index };
  }
  return null;
}

/** True if the given slot coordinates exist in the fixed 7/15/10 shape. */
export function isValidSlot(tierKey, index) {
  const count = slotCountFor(tierKey);
  return count > 0 && Number.isInteger(index) && index >= 0 && index < count;
}

/**
 * Place an item into a slot.
 *
 * The interesting case is a collision. If the target slot is already taken:
 *   - and the incoming item came from another slot, the two items SWAP
 *   - and the incoming item came from the pool, the occupant is bumped back
 *     to the pool
 *
 * Swapping rather than refusing is what makes the tap-item-then-tap-slot
 * interaction feel right: you never have to empty a slot before reusing it.
 *
 * @returns {object} a new placements object (the input is never mutated)
 */
export function placeItem(placements, itemId, tierKey, index) {
  if (!itemId) return placements;
  if (!isValidSlot(tierKey, index)) return placements;

  const occupant = placements?.[tierKey]?.[index] ?? null;
  if (occupant === itemId) return placements; // already there, nothing to do

  const from = findSlotOfItem(placements, itemId);
  const next = clonePlacements(placements);

  next[tierKey][index] = itemId;

  if (from) {
    // Vacate the old slot — handing it to the displaced occupant if there
    // was one, otherwise just emptying it.
    next[from.tierKey][from.index] = occupant;
  }
  // If `from` is null the item came from the pool, and any occupant it
  // displaced simply returns to the pool by no longer being placed.

  return next;
}

/**
 * Empty a single slot, returning whatever was there to the unassigned pool.
 * @returns {object} a new placements object
 */
export function removeFromSlot(placements, tierKey, index) {
  if (!isValidSlot(tierKey, index)) return placements;
  if (placements?.[tierKey]?.[index] == null) return placements;

  const next = clonePlacements(placements);
  next[tierKey][index] = null;
  return next;
}

/**
 * Send an item back to the pool, wherever it currently sits.
 * @returns {object} a new placements object
 */
export function unassignItem(placements, itemId) {
  const from = findSlotOfItem(placements, itemId);
  if (!from) return placements;
  return removeFromSlot(placements, from.tierKey, from.index);
}

/**
 * Empty every slot in one tier.
 * @returns {object} a new placements object
 */
export function clearTier(placements, tierKey) {
  const count = slotCountFor(tierKey);
  if (!count) return placements;
  const next = clonePlacements(placements);
  next[tierKey] = new Array(count).fill(null);
  return next;
}

/** Items not currently sitting in any slot, in their original order. */
export function getUnassignedItems(items = [], placements) {
  const placed = new Set();
  for (const tier of TIER_SHAPE) {
    for (const id of placements?.[tier.key] || []) {
      if (id) placed.add(id);
    }
  }
  return items.filter((item) => !placed.has(item.id));
}

/** How many slots in a given tier are filled. */
export function countFilledInTier(placements, tierKey) {
  return (placements?.[tierKey] || []).filter(Boolean).length;
}

/** How many of the 32 slots are filled overall. */
export function countFilled(placements) {
  return TIER_KEYS.reduce((sum, key) => sum + countFilledInTier(placements, key), 0);
}

/** Convenience lookup used all over the editor. */
export function itemById(items = [], itemId) {
  if (!itemId) return null;
  return items.find((i) => i.id === itemId) || null;
}

/**
 * Initials shown when an item has a label but no uploaded image yet.
 * "Anna Marie Kent" -> "AK", "Bri" -> "BR", "" -> "?"
 */
export function initialsFor(label) {
  const words = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
