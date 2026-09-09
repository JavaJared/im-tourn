import { describe, it, expect } from 'vitest';
import retention from '../scripts/retain-build-artifacts.cjs';

describe('artifact retention setup', () => {
  it('updates only labels and preserves existing labels', async () => {
    const requests = [];
    const client = { request: async request => {
      requests.push(request);
      return { data: { labels: { owner: 'firebase' } } };
    } };
    await retention.retainBuildArtifacts(client, 'i-m-tourn');
    expect(requests).toHaveLength(2);
    expect(requests[1].params).toEqual({ updateMask: 'labels' });
    expect(requests[1].data).toEqual({
      name: 'projects/i-m-tourn/locations/us-central1/repositories/gcf-artifacts',
      labels: { owner: 'firebase', 'firebase-functions-cleanup-opted-out': 'true' },
    });
  });

  it.each([
    { labels: { 'firebase-functions-cleanup-opted-out': 'true' } },
    { cleanupPolicies: { existing: { action: 'KEEP' } } },
  ])('preserves existing retention configuration', async repository => {
    const requests = [];
    await retention.retainBuildArtifacts({ request: async request => {
      requests.push(request);
      return { data: repository };
    } }, 'i-m-tourn');
    expect(requests).toHaveLength(1);
  });

  it('fails on permission errors so deployment cannot proceed', async () => {
    await expect(retention.retainBuildArtifacts({ request: async () => {
      throw new Error('Permission denied');
    } }, 'i-m-tourn')).rejects.toThrow('Permission denied');
  });
});
