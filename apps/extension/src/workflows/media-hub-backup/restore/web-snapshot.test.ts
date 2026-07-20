import JSZip from 'jszip';
import { afterEach, expect, it, vi } from 'vitest';

import type { WebSnapshotSource } from '@sniptale/runtime-contracts/web-snapshot';
import {
  createWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../../features/web-snapshot/manifest';
import { createBackupWebSnapshotRecord } from './web-snapshot';

async function createWebSnapshotPackage(
  extraEntries: Array<[string, string | Uint8Array]> = [],
  source: WebSnapshotSource = { faviconUrl: null, title: 'Page', url: 'https://example.com' }
) {
  const zip = new JSZip();
  zip.file(
    WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
    JSON.stringify(
      createWebSnapshotManifest({
        id: 'snapshot-1',
        source,
      })
    )
  );
  for (const [path, value] of extraEntries) {
    zip.file(path, value);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('creates a web snapshot record from a profiled backup package', async () => {
  const packageBlob = await createWebSnapshotPackage([
    ['snapshot/index.html', '<main>Page</main>'],
  ]);

  await expect(
    createBackupWebSnapshotRecord({
      createdAt: 1,
      packageBlob,
      snapshotId: 'snapshot-1',
      updatedAt: 2,
    })
  ).resolves.toEqual(
    expect.objectContaining({
      id: 'snapshot-1',
      manifest: expect.objectContaining({ id: 'snapshot-1' }),
      packageBlob: expect.any(Blob),
    })
  );
});

it('stores sanitized web snapshot package manifests from restored packages', async () => {
  const packageBlob = await createWebSnapshotPackage(
    [['snapshot/index.html', '<main>Page</main>']],
    {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      title: 'Page',
      url: 'https://user:pass@example.com/reset-password/abc123?token=secret#hash',
    }
  );

  const record = await createBackupWebSnapshotRecord({
    createdAt: 1,
    packageBlob,
    snapshotId: 'snapshot-1',
    updatedAt: 2,
  });

  expect(record.manifest.source).toEqual({
    faviconUrl: 'https://example.com/favicon.ico',
    title: 'Page',
    url: 'https://example.com/',
  });
  const zip = await JSZip.loadAsync(await record.packageBlob.arrayBuffer());
  const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
  expect(JSON.parse(manifestText ?? '{}').source.url).toBe('https://example.com/');
});

it('rejects nested web snapshot packages whose inflated entries exceed the cap', async () => {
  const manifest = JSON.stringify(
    createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    })
  );
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, manifest);
  zip.file('assets/large.bin', 'placeholder');
  const largeEntry = zip.file('assets/large.bin');
  if (!largeEntry) {
    throw new Error('Expected test web snapshot package entry.');
  }
  Object.defineProperty(largeEntry, '_data', {
    configurable: true,
    value: { compressedSize: 32, uncompressedSize: 129 * 1024 * 1024 },
  });
  const readRejectedEntry = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  vi.spyOn(largeEntry, 'async').mockImplementation(readRejectedEntry);
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  await expect(
    createBackupWebSnapshotRecord({
      createdAt: 1,
      packageBlob: new Blob(['zip']),
      snapshotId: 'snapshot-1',
      updatedAt: 2,
    })
  ).rejects.toThrow('Web snapshot package entry is too large.');

  expect(readRejectedEntry).not.toHaveBeenCalled();
});

it('rejects nested web snapshot packages with too many entries', async () => {
  const zip = new JSZip();
  for (let index = 0; index <= 2000; index += 1) {
    zip.file(`assets/${index}.txt`, 'x');
  }
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  await expect(
    createBackupWebSnapshotRecord({
      createdAt: 1,
      packageBlob: new Blob(['zip']),
      snapshotId: 'snapshot-1',
      updatedAt: 2,
    })
  ).rejects.toThrow('Web snapshot package has too many files.');
});

it('rejects nested web snapshot package total metadata before inflating entries', async () => {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify({}));
  const paths = Array.from({ length: 14 }, (_, index) => `assets/${index}.bin`);
  for (const path of paths) {
    zip.file(path, 'x');
    const entry = zip.file(path);
    Object.defineProperty(entry, '_data', {
      configurable: true,
      value: { compressedSize: 20 * 1024 * 1024, uncompressedSize: 20 * 1024 * 1024 },
    });
  }
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  await expect(
    createBackupWebSnapshotRecord({
      createdAt: 1,
      packageBlob: new Blob(['zip']),
      snapshotId: 'snapshot-1',
      updatedAt: 2,
    })
  ).rejects.toThrow('Web snapshot package inflated size is too large.');
});

it('rejects nested web snapshot manifest metadata before inflating manifest JSON', async () => {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, 'placeholder');
  const manifestEntry = zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest);
  if (!manifestEntry) {
    throw new Error('Expected test manifest entry.');
  }
  const readManifest = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  Object.defineProperty(manifestEntry, '_data', {
    configurable: true,
    value: { compressedSize: 4096, uncompressedSize: 2 * 1024 * 1024 },
  });
  vi.spyOn(manifestEntry, 'async').mockImplementation(readManifest);
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  await expect(
    createBackupWebSnapshotRecord({
      createdAt: 1,
      packageBlob: new Blob(['zip']),
      snapshotId: 'snapshot-1',
      updatedAt: 2,
    })
  ).rejects.toThrow('Web snapshot package manifest is too large.');

  expect(readManifest).not.toHaveBeenCalled();
});
