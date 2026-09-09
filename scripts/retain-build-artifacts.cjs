// Firebase's noninteractive deploy requires a cleanup policy or opt-out label.
// Patch only labels: preserve any existing policies and never delete artifacts.
const OPT_OUT_LABEL = 'firebase-functions-cleanup-opted-out';

async function retainBuildArtifacts(client, projectId) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId || '')) {
    throw new Error('A valid FIREBASE_PROJECT_ID is required.');
  }
  const name = `projects/${projectId}/locations/us-central1/repositories/gcf-artifacts`;
  const url = `https://artifactregistry.googleapis.com/v1/${name}`;
  const { data: repository } = await client.request({ url });
  if (repository.labels?.[OPT_OUT_LABEL] || Object.keys(repository.cleanupPolicies || {}).length) {
    console.log('Existing artifact retention configuration preserved.');
    return;
  }
  await client.request({
    url, method: 'PATCH', params: { updateMask: 'labels' },
    data: { name, labels: { ...repository.labels, [OPT_OUT_LABEL]: 'true' } },
  });
  console.log('Build artifacts retained; automatic cleanup remains disabled.');
}

if (require.main === module) {
  // Use the authentication library bundled with the locked Firebase CLI.
  const cliRequire = require('node:module').createRequire(require.resolve('firebase-tools/package.json'));
  const { GoogleAuth } = cliRequire('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  auth.getClient().then(client => retainBuildArtifacts(client, process.env.FIREBASE_PROJECT_ID)).catch(error => {
    // Do not log request headers or credential-bearing error objects.
    const detail = error.response?.data?.error;
    console.error(`Artifact retention setup failed (${detail?.status || error.code || 'error'}): ${detail?.message || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { retainBuildArtifacts };
