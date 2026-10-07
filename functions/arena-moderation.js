const { getApp } = require('firebase-admin/app');
const REQUIRED = ['harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'self-harm', 'self-harm/intent', 'self-harm/instructions', 'sexual', 'sexual/minors', 'violence', 'violence/graphic'];
let cachedKey = null, cachedUntil = 0;
async function getKey() {
  // Emulator tests never access production secrets or the external API.
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIRESTORE_EMULATOR_HOST) return null;
  if (Date.now() < cachedUntil) return cachedKey;
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) return null;
  try {
    const token = await getApp().options.credential.getAccessToken();
    const response = await fetch(`https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(project)}/secrets/GOAT_MODERATION_API_KEY/versions/latest:access`, {
      headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(5000),
    });
    const payload = response.ok ? await response.json() : null;
    cachedKey = payload?.payload?.data ? Buffer.from(payload.payload.data, 'base64').toString('utf8').trim() : null;
  } catch { cachedKey = null; }
  cachedUntil = Date.now() + (cachedKey ? 60000 : 15000);
  return cachedKey;
}
function decision(data) {
  const result = data?.results?.[0];
  if (data?.results?.length !== 1 || typeof result?.flagged !== 'boolean' || !REQUIRED.every(k => typeof result.categories?.[k] === 'boolean' && Number.isFinite(result.category_scores?.[k]) && result.category_scores[k] >= 0 && result.category_scores[k] <= 1)) {
    return { status: 'pending', reason: 'invalid-response' };
  }
  const categories = Object.keys(result.categories).filter(k => result.categories[k] === true);
  const uncertain = Object.values(result.category_scores).some(score => !Number.isFinite(score) || score >= 0.4);
  return { status: result.flagged || categories.length || uncertain ? 'pending' : 'approved', reason: result.flagged || categories.length ? 'flagged' : uncertain ? 'uncertain' : 'passed', categories, model: typeof data.model === 'string' ? data.model.slice(0,100) : 'omni-moderation-latest' };
}
async function classify(body, options = {}) {
  try {
    const key = await (options.getKey || getKey)();
    if (!key) return { status: 'pending', reason: 'not-configured' };
    const response = await (options.fetch || fetch)('https://api.openai.com/v1/moderations', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: body }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: 'pending', reason: 'service-unavailable' };
    return decision(await response.json());
  } catch { return { status: 'pending', reason: 'service-unavailable' }; }
}
module.exports = { classify, decision, getKey };
