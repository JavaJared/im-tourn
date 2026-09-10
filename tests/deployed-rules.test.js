import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
const { verifyActiveRules } = createRequire(import.meta.url)('../scripts/verify-deployed-rules.cjs');
const expected = { firestore: 'firestore source\n', storage: 'storage source\n' };
const active = (name, content) => ({ name, source: [{ name: `${name}.rules`, content }] });
function client() {
  return {
    getFirestoreRuleset: vi.fn().mockResolvedValue(active('firestore', expected.firestore)),
    getStorageRuleset: vi.fn().mockResolvedValue(active('storage', expected.storage)),
  };
}
it('verifies both active releases and targets the actual Storage bucket', async () => {
  const rules = client();
  const report = await verifyActiveRules(rules, expected, 'test.firebasestorage.app');
  expect(report.map(row => row.service)).toEqual(['Firestore', 'Storage']);
  expect(report.every(row => /^[a-f0-9]{64}$/.test(row.sha256))).toBe(true);
  expect(rules.getStorageRuleset).toHaveBeenCalledWith('test.firebasestorage.app');
});
it.each(['Firestore', 'Storage'])('rejects stale or changed %s rules', async service => {
  const rules = client();
  rules[`get${service}Ruleset`].mockResolvedValue(active(service, 'allow write: if true;'));
  await expect(verifyActiveRules(rules, expected, 'bucket')).rejects.toThrow(`${service}: active rules do not match`);
});
it('rejects unexpected additional source files', async () => {
  const rules = client();
  rules.getStorageRuleset.mockResolvedValue({ source: [{ content: expected.storage }, { content: 'extra' }] });
  await expect(verifyActiveRules(rules, expected, 'bucket')).rejects.toThrow('Storage: active rules do not match');
});
it('does not expose SDK request details when verification cannot read a release', async () => {
  const rules = client();
  rules.getFirestoreRuleset.mockRejectedValue(new Error('request Authorization: secret-token'));
  const result = await verifyActiveRules(rules, expected, 'bucket').catch(error => error.message);
  expect(result).toContain('Firestore: could not read active rules');
  expect(result).not.toContain('secret-token');
  expect(rules.getStorageRuleset).toHaveBeenCalledOnce();
});
it('accepts line-ending differences without ignoring rule changes', async () => {
  const rules = client();
  rules.getFirestoreRuleset.mockResolvedValue(active('firestore', expected.firestore.replace(/\n/g, '\r\n')));
  await expect(verifyActiveRules(rules, expected, 'bucket')).resolves.toHaveLength(2);
});
