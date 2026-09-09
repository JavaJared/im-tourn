export function timestampMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return +value.toDate();
  if (value.seconds != null) return value.seconds * 1000;
  const n = +new Date(value);
  return Number.isFinite(n) ? n : null;
}
export function predictionsOpen(pool, now = Date.now()) {
  const deadline = timestampMillis(pool?.lockDate);
  return pool?.status === 'open' && (deadline == null || now < deadline);
}
export function requirePredictionsOpen(pool) {
  if (!predictionsOpen(pool)) throw new Error('Predictions are closed. The deadline may have passed.');
}
