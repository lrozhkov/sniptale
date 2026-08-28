import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
} from '@sniptale/runtime-contracts/page-package';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  sanitizeSnapshot: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readFile,
}));
vi.mock('../../../../features/web-snapshot/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: mocks.sanitizeSnapshot,
}));

import { mediaLibraryRootPublisher } from './media';
import { createCleanupWebSnapshotRecord } from '../../../media-hub/cleanup.test-support';
import { createPagePackageManifestFixture as createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest.test-support';
import { assertPortableJson } from '../codec';
import type { JsonValue } from '../contracts';

function portableJson(value: unknown): JsonValue {
  assertPortableJson(value);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('media v6 Web Snapshot Library profile validation', () => {
  it.each([
    [{ kind: 'screenshot' }, 'kind', 'Portable web snapshot role association is invalid.'],
    [{ mimeType: 'application/zip' }, 'MIME', 'Restored Page Package Library metadata is invalid.'],
    [
      { filename: 'snapshot.zip', originalFilename: 'snapshot.zip' },
      'filename',
      'Restored Page Package Library metadata is invalid.',
    ],
    [
      { originalFilename: 'other.sniptale-page-package.zip' },
      'original filename',
      'Restored Page Package Library metadata is invalid.',
    ],
    [{ size: 2 }, 'size', 'Restored Page Package Library metadata is invalid.'],
  ])(
    'rejects hostile top-level Page Package Library metadata: %s',
    async (overrides, _label, errorMessage) => {
      const stored = createCleanupWebSnapshotRecord('snapshot');
      stored.size = 1;
      stored.screenshotSize = 1;

      await expect(
        mediaLibraryRootPublisher.prepareStaged!({
          envelope: {
            descriptor: {
              mediaSubtype: 'library-item',
              metadataPath: '_sniptale/metadata/media/snapshot.json',
              objectCount: 2,
              rootId: 'snapshot',
              rootKind: 'media',
              totalBytes: 2,
            },
            metadata: portableJson({
              entry: {
                createdAt: 1,
                duration: null,
                filename: 'snapshot.sniptale-page-package.zip',
                height: 1,
                id: 'snapshot',
                kind: 'web-archive',
                mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
                originalFilename: 'snapshot.sniptale-page-package.zip',
                size: 1,
                source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
                sourceFavicon: null,
                sourceTitle: null,
                sourceUrl: null,
                tags: [],
                updatedAt: 1,
                width: 1,
                ...overrides,
              },
              originalObjectId: 'package-object',
              webSnapshot: {
                entry: {
                  createdAt: stored.createdAt,
                  id: stored.id,
                  manifest: stored.manifest,
                  screenshotMimeType: stored.screenshotMimeType,
                  screenshotSize: stored.screenshotSize,
                  size: stored.size,
                  updatedAt: stored.updatedAt,
                },
                packageObjectId: 'package-object',
                screenshotObjectId: 'screenshot-object',
              },
            }),
            objects: [],
          },
          staged: [
            {
              objectId: 'package-object',
              ref: {
                assetId: 'package',
                createdAt: 1,
                location: { kind: 'opfs', objectKey: 'objects/package' },
                mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
                sha256: null,
                size: 1,
              },
            },
            {
              objectId: 'screenshot-object',
              ref: {
                assetId: 'screenshot',
                createdAt: 1,
                location: { kind: 'opfs', objectKey: 'objects/screenshot' },
                mimeType: 'image/png',
                sha256: null,
                size: 1,
              },
            },
          ],
        })
      ).rejects.toThrow(errorMessage);

      expect(mocks.readFile).not.toHaveBeenCalled();
      expect(mocks.sanitizeSnapshot).not.toHaveBeenCalled();
    }
  );
});

describe('media v6 Web Snapshot manifest policy validation', () => {
  it('rejects missing and inverse Web Snapshot role associations before staged reads', async () => {
    const stored = createCleanupWebSnapshotRecord('snapshot');
    const descriptor = {
      mediaSubtype: 'library-item' as const,
      metadataPath: '_sniptale/metadata/media/snapshot.json',
      objectCount: 0,
      rootId: 'snapshot',
      rootKind: 'media' as const,
      totalBytes: 0,
    };
    const webArchiveEntry = {
      createdAt: 1,
      duration: null,
      filename: 'snapshot.sniptale-page-package.zip',
      height: 1,
      id: 'snapshot',
      kind: 'web-archive',
      mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
      originalFilename: 'snapshot.sniptale-page-package.zip',
      size: 1,
      source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 1,
      width: 1,
    };

    await expect(
      mediaLibraryRootPublisher.prepareStaged!({
        envelope: {
          descriptor,
          metadata: portableJson({ entry: webArchiveEntry, originalObjectId: 'package-object' }),
          objects: [],
        },
        staged: [],
      })
    ).rejects.toThrow('Portable web snapshot role association is invalid.');

    await expect(
      mediaLibraryRootPublisher.prepareStaged!({
        envelope: {
          descriptor,
          metadata: portableJson({
            entry: {
              ...webArchiveEntry,
              filename: 'capture.png',
              kind: 'screenshot',
              mimeType: 'image/png',
              originalFilename: 'capture.png',
              source: { kind: 'screenshot' },
            },
            originalObjectId: 'package-object',
            webSnapshot: {
              entry: {
                createdAt: stored.createdAt,
                id: stored.id,
                manifest: stored.manifest,
                screenshotMimeType: stored.screenshotMimeType,
                screenshotSize: stored.screenshotSize,
                size: stored.size,
                updatedAt: stored.updatedAt,
              },
              packageObjectId: 'package-object',
              screenshotObjectId: 'screenshot-object',
            },
          }),
          objects: [],
        },
        staged: [],
      })
    ).rejects.toThrow('Portable web snapshot role association is invalid.');

    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('rejects active Web-copy MIME types from backup metadata before staged reads', async () => {
    const stored = createCleanupWebSnapshotRecord('snapshot');
    stored.manifest = createWebSnapshotManifest({
      entries: [
        ...stored.manifest.entries,
        {
          component: 'webCopy',
          mimeType: 'application/javascript',
          path: 'assets/payload.js',
          sha256: '0'.repeat(64),
          size: 0,
        },
      ],
      id: 'snapshot',
    });

    await expect(
      mediaLibraryRootPublisher.prepareStaged!({
        envelope: {
          descriptor: {
            mediaSubtype: 'library-item',
            metadataPath: '_sniptale/metadata/media/snapshot.json',
            objectCount: 2,
            rootId: 'snapshot',
            rootKind: 'media',
            totalBytes: 2,
          },
          metadata: portableJson({
            entry: {
              createdAt: 1,
              duration: null,
              filename: 'snapshot.sniptale-page-package.zip',
              height: 1,
              id: 'snapshot',
              kind: 'web-archive',
              mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
              originalFilename: 'snapshot.sniptale-page-package.zip',
              size: 1,
              source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
              sourceFavicon: null,
              sourceTitle: null,
              sourceUrl: null,
              tags: [],
              updatedAt: 1,
              width: 1,
            },
            originalObjectId: 'package-object',
            webSnapshot: {
              entry: {
                createdAt: stored.createdAt,
                id: stored.id,
                manifest: stored.manifest,
                screenshotMimeType: 'image/png',
                screenshotSize: 1,
                size: 1,
                updatedAt: stored.updatedAt,
              },
              packageObjectId: 'package-object',
              screenshotObjectId: 'screenshot-object',
            },
          }),
          objects: [],
        },
        staged: [],
      })
    ).rejects.toThrow('Restored web snapshot manifest is invalid.');

    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it.each([
    ['export', 'standard'],
    ['export', 'extended'],
  ] as const)(
    'rejects non-Library Page Package profiles before reading staged objects: %s / %s',
    async (intent, diagnosticsLevel) => {
      const stored = createCleanupWebSnapshotRecord('snapshot');
      const baseManifest = createWebSnapshotManifest();
      const entries =
        diagnosticsLevel === 'extended'
          ? [
              ...baseManifest.entries.filter((entry) => entry.component !== 'diagnostics'),
              ...PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((entry) => ({
                ...entry,
                component: 'diagnostics' as const,
                sha256: '0'.repeat(64),
                size: 0,
              })),
            ]
          : undefined;
      stored.manifest = createWebSnapshotManifest({
        diagnosticsLevel,
        ...(entries ? { entries } : {}),
        id: 'snapshot',
        intent,
        source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
      });

      await expect(
        mediaLibraryRootPublisher.prepareStaged!({
          envelope: {
            descriptor: {
              mediaSubtype: 'library-item',
              metadataPath: '_sniptale/metadata/media/snapshot.json',
              objectCount: 2,
              rootId: 'snapshot',
              rootKind: 'media',
              totalBytes: 2,
            },
            metadata: portableJson({
              entry: {
                createdAt: 1,
                duration: null,
                filename: 'snapshot.sniptale-page-package.zip',
                height: 1,
                id: 'snapshot',
                kind: 'web-archive',
                mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
                originalFilename: 'snapshot.sniptale-page-package.zip',
                size: 1,
                source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
                sourceFavicon: null,
                sourceTitle: null,
                sourceUrl: null,
                tags: [],
                updatedAt: 1,
                width: 1,
                workspaceRevision: 0,
              },
              originalObjectId: 'package-object',
              webSnapshot: {
                entry: {
                  createdAt: stored.createdAt,
                  id: stored.id,
                  manifest: stored.manifest,
                  screenshotMimeType: stored.screenshotMimeType,
                  screenshotSize: stored.screenshotSize,
                  size: stored.size,
                  updatedAt: stored.updatedAt,
                },
                packageObjectId: 'package-object',
                screenshotObjectId: 'screenshot-object',
              },
            }),
            objects: [],
          },
          staged: [],
        })
      ).rejects.toThrow('Restored Page Package uses a non-Library profile.');

      expect(mocks.readFile).not.toHaveBeenCalled();
      expect(mocks.sanitizeSnapshot).not.toHaveBeenCalled();
    }
  );
});
