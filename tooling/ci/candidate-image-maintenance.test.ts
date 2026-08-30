import { describe, expect, it, vi } from 'vitest';

import {
  applyCandidateImageSweep,
  createCandidateImageSweepReport,
  normalizeGhcrVersions,
} from './candidate-image-maintenance.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const key = 'b'.repeat(64);
const authority = {
  schemaVersion: 1,
  idleTtlSeconds: 604800,
  images: {
    qa: {
      repository: 'ghcr.io/lrozhkov/sniptale-qa',
      tagPrefix: 'candidate-cache-v1-qa',
      quarantinedKeys: [],
    },
  },
};

describe('candidate image maintenance', () => {
  it('normalizes the exact GHCR version identity and verified image labels', () => {
    const versions = normalizeGhcrVersions(
      authority.images.qa.repository,
      [
        {
          id: 7,
          name: digest,
          created_at: '2026-08-01T00:00:00Z',
          metadata: { container: { tags: [`candidate-cache-v1-qa-${key}`] } },
        },
      ],
      () => ({ digest, labels: { 'dev.sniptale.candidate-cache.key': key } })
    );
    expect(versions[0]).toMatchObject({ id: 7, digest, createdAt: 1785542400 });
  });

  it('deletes only exact eligible version ids after the seven-day liveness proof', () => {
    const now = 2_000_000;
    const report = createCandidateImageSweepReport({
      authority,
      inventories: {
        qa: [
          {
            id: 7,
            package: authority.images.qa.repository,
            digest,
            tags: [`candidate-cache-v1-qa-${key}`],
            labels: { 'dev.sniptale.candidate-cache.key': key },
            createdAt: now - 604800,
          },
        ],
      },
      useReceipts: [],
      now,
    });
    const remove = vi.fn();
    expect(applyCandidateImageSweep(report, remove)).toEqual([
      { repository: authority.images.qa.repository, versionId: 7 },
    ]);
    expect(remove).toHaveBeenCalledWith(
      '/users/lrozhkov/packages/container/sniptale-qa/versions/7'
    );
  });

  it('preserves a version refreshed by a verified use receipt', () => {
    const now = 2_000_000;
    const report = createCandidateImageSweepReport({
      authority,
      inventories: {
        qa: [
          {
            id: 7,
            package: authority.images.qa.repository,
            digest,
            tags: [`candidate-cache-v1-qa-${key}`],
            labels: { 'dev.sniptale.candidate-cache.key': key },
            createdAt: 1,
          },
        ],
      },
      useReceipts: [{ verified: true, digest, usedAt: now - 1 }],
      now,
    });
    expect(report.images[0].decisions[0]).toMatchObject({ delete: false, reason: 'live' });
  });
});
