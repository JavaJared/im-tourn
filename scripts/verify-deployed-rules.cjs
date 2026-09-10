// Read the active releases, not just uploaded rulesets. This script never writes
// rules, production documents, or Storage objects.
const { readFileSync, appendFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const normalize = source => source.replace(/\r\n/g, '\n');

async function verifyActiveRules(rules, expected, bucket) {
  const targets = [
    { label: 'Firestore', source: expected.firestore, read: () => rules.getFirestoreRuleset() },
    { label: 'Storage', source: expected.storage, read: () => rules.getStorageRuleset(bucket) },
  ];
  const checks = await Promise.allSettled(targets.map(async target => {
    let active;
    try {
      active = await target.read();
    } catch {
      // SDK errors may contain request details. Do not print credentials or bodies.
      throw new Error(`${target.label}: could not read active rules. Check Firebase Rules read permissions and the project/bucket configuration.`);
    }
    if (active.source?.length !== 1 || typeof active.source[0].content !== 'string'
      || normalize(active.source[0].content) !== normalize(target.source)) {
      throw new Error(`${target.label}: active rules do not match the checked-out rules file.`);
    }
    return {
      service: target.label,
      ruleset: active.name,
      sha256: createHash('sha256').update(normalize(target.source)).digest('hex'),
    };
  }));
  const failures = checks.filter(check => check.status === 'rejected');
  if (failures.length) throw new Error(failures.map(check => check.reason.message).join('\n'));
  return checks.map(check => check.value);
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!projectId || !bucket) throw new Error('FIREBASE_PROJECT_ID and FIREBASE_STORAGE_BUCKET are required.');
  const requireFunctions = require('node:module').createRequire(resolve(__dirname, '../functions/package.json'));
  const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
  const { getSecurityRules } = requireFunctions('firebase-admin/security-rules');
  const app = initializeApp({ projectId, storageBucket: bucket });
  try {
    const report = await verifyActiveRules(getSecurityRules(app), {
      firestore: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      storage: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
    }, bucket);
    for (const row of report) console.log(`${row.service}: active rules match the repository (SHA-256 ${row.sha256}).`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
        '## Active security rules verified', '',
        `Project: ${projectId}. Storage bucket: ${bucket}.`, '',
        '| Service | Active ruleset | Source SHA-256 |',
        '| --- | --- | --- |',
        ...report.map(row => `| ${row.service} | ${row.ruleset} | ${row.sha256} |`), '',
        'Both active releases match this workflow’s checked-out rules. Emulator tests verify permission boundaries; signed-in site checks verify the user experience.', '',
      ].join('\n'));
    }
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { verifyActiveRules };
