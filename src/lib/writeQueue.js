// Serialize mutations per document without blocking unrelated work. A failure
// rejects its caller but never poisons the remainder of the queue.
export function createWriteQueue() {
  const tails = new Map();
  return (key, operation) => {
    const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(operation);
    tails.set(key, next);
    next.finally(() => { if (tails.get(key) === next) tails.delete(key); }).catch(() => {});
    return next;
  };
}
