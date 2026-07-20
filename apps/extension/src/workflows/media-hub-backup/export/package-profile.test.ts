import { describe, expect, it } from 'vitest';
import type JSZip from 'jszip';

import { assertMediaHubBackupZipLimits } from './package-profile';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../manifest';
import type { MediaHubBackupManifest } from '../contracts/types';

function createManifest(overrides: Partial<MediaHubBackupManifest> = {}): MediaHubBackupManifest {
  return {
    assetCount: 1,
    effectBundleCount: 0,
    exportedAt: '2026-01-01T00:00:00.000Z',
    format: BACKUP_FORMAT,
    thumbnailCount: 1,
    version: BACKUP_VERSION,
    ...overrides,
  };
}

function createZipWithEntryCount(entryCount: number): JSZip {
  const files = Object.fromEntries(
    Array.from({ length: entryCount }, (_, index) => [`entry-${index}`, {}])
  );
  return { files } as JSZip;
}

describe('media hub backup export package profile', () => {
  it('accepts packages inside the fixed entry budgets', () => {
    expect(() =>
      assertMediaHubBackupZipLimits(createZipWithEntryCount(2), createManifest())
    ).not.toThrow();
  });

  it('rejects packages with too many archive entries', () => {
    expect(() =>
      assertMediaHubBackupZipLimits(createZipWithEntryCount(2001), createManifest())
    ).toThrow('Media hub backup package has too many entries.');
  });

  it('rejects manifests whose declared asset entries exceed the package budget', () => {
    expect(() =>
      assertMediaHubBackupZipLimits(
        createZipWithEntryCount(2),
        createManifest({ assetCount: 2000, thumbnailCount: 1 })
      )
    ).toThrow('Media hub backup manifest exceeds package entry budget.');
  });
});
