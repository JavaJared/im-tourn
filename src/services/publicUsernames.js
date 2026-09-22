import { callServer } from './server';

const records = new Map(), queued = new Set();
let scheduled = false;
export const validUserId = id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id);
function record(id) {
  if (!records.has(id)) records.set(id, { username: undefined, expires: 0, busy: false, revision: 0, listeners: new Set() });
  return records.get(id);
}
function publish(entry, username) {
  entry.username = typeof username === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(username) ? username : null;
  entry.expires = Date.now() + 60000;
  entry.listeners.forEach(notify => notify(entry.username));
}
export function rememberUsername(id, username) {
  if (!validUserId(id)) return;
  const entry = record(id); entry.revision++;
  publish(entry, username);
}
async function flush() {
  scheduled = false;
  const ids = [...queued]; queued.clear();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const revisions = batch.map(id => record(id).revision);
    let usernames = {};
    try { usernames = (await callServer('getPublicUsernames', { userIds: batch }))?.usernames || {}; }
    catch { /* Show an unavailable label and retry on the next refresh. */ }
    batch.forEach((id, index) => {
      const entry = record(id); entry.busy = false;
      if (entry.revision === revisions[index]) publish(entry, usernames[id]);
    });
  }
}
export function refreshUsername(id) {
  if (!validUserId(id)) return;
  const entry = record(id);
  if (entry.busy || entry.expires > Date.now()) return;
  entry.busy = true; queued.add(id);
  if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
}
export function subscribeUsername(id, notify) {
  if (!validUserId(id)) { notify(null); return () => {}; }
  const entry = record(id); entry.listeners.add(notify); notify(entry.username);
  refreshUsername(id);
  // Bound the cache without discarding mounted labels or in-flight requests.
  if (records.size > 1000) for (const [key, value] of records) {
    if (!value.listeners.size && !value.busy) records.delete(key);
    if (records.size <= 1000) break;
  }
  return () => entry.listeners.delete(notify);
}
