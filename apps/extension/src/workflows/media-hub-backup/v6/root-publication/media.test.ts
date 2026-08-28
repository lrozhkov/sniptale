import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import type {
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../../composition/persistence/assets';

const mocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  discard: vi.fn(),
  readFile: vi.fn(),
  runMutation: vi.fn(),
  sanitizeSnapshot: vi.fn(),
  writeBlob: vi.fn(),
  validateRetainedScreenshot: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    operationId: 'delete-1',
    status: 'pending',
    type: 'physical-delete',
  }),
  discardPreparedAsset: mocks.discard,
  readAssetFile: mocks.readFile,
  writeBlobToAsset: mocks.writeBlob,
}));
vi.mock('../../../../features/web-snapshot/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: mocks.sanitizeSnapshot,
}));
vi.mock('../../../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/web-snapshot/screenshot-validation')
  >()),
  validateRetainedWebSnapshotScreenshot: mocks.validateRetainedScreenshot,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
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

const journal = {
  assetRefs: [],
  createdAt: 1,
  domain: 'archive-restore',
  journalId: 'journal-1',
  payload: {},
} satisfies AssetReadyJournal;
const session = {
  archiveFingerprint: 'a'.repeat(64),
  committedRoots: [],
  conflictedRoots: [],
  createdAt: 1,
  currentRoot: 'media:library-item:media-one',
  kind: 'archive-restore-session' as const,
  operationId: 'restore-1',
  rootIdMap: {},
  skippedRoots: [],
  status: 'pending' as const,
  strategy: 'replace' as const,
  updatedAt: 1,
} satisfies ArchiveRestoreSession;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('media v6 root publication', () => {
  it('publishes screenshot metadata and the restore checkpoint atomically', async () => {
    const stores = new Map<
      string,
      { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
    >();
    const storeFor = (name: string) => {
      const store = stores.get(name) ?? { get: vi.fn().mockResolvedValue(undefined), put: vi.fn() };
      stores.set(name, store);
      return store;
    };
    const tx = { done: Promise.resolve(), objectStore: vi.fn(storeFor) };
    mocks.runMutation.mockImplementation(async (callback) =>
      callback({ transaction: vi.fn(() => tx) })
    );
    mocks.readFile.mockResolvedValue(new File(['image'], 'capture.png', { type: 'image/png' }));

    const result = await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/media-one.json',
          objectCount: 1,
          rootId: 'media-one',
          rootKind: 'media',
          totalBytes: 5,
        },
        metadata: portableJson({
          entry: {
            createdAt: 1,
            duration: null,
            filename: 'capture.png',
            height: 80,
            id: 'media-one',
            kind: 'screenshot',
            mimeType: 'image/png',
            originalFilename: 'capture.png',
            size: 5,
            source: { kind: 'screenshot' },
            sourceFavicon: null,
            sourceTitle: null,
            sourceUrl: null,
            tags: [],
            updatedAt: 2,
            width: 100,
            workspaceRevision: 0,
          },
          originalObjectId: 'object-one',
        }),
        objects: [],
      },
      journal,
      session,
      staged: [
        {
          objectId: 'object-one',
          ref: {
            assetId: 'local-one',
            createdAt: 1,
            location: { kind: 'opfs', objectKey: 'objects/local-one' },
            mimeType: 'image/png',
            sha256: null,
            size: 5,
          },
        },
      ],
    });

    expect(result).toEqual({ conflicted: false, imported: true, retainedAssetIds: [] });
    expect(storeFor('media_library').put).toHaveBeenCalledWith(
      expect.objectContaining({ blob: expect.any(File), id: 'media-one' })
    );
    expect(mocks.checkpoint).toHaveBeenCalledWith(
      expect.anything(),
      'restore-1',
      'media:library-item:media-one',
      'media-one',
      true,
      false
    );
  });
});

describe('media v6 web snapshot root validation', () => {
  it('validates and replaces a sanitized nested snapshot package before journaling', async () => {
    const stored = createCleanupWebSnapshotRecord('snapshot');
    stored.manifest = createWebSnapshotManifest({
      id: 'snapshot',
      source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
    });
    stored.size = 15;
    stored.screenshotSize = 5;
    const safeManifest = {
      ...stored.manifest,
      source: { faviconUrl: null, title: null, url: null },
    };
    const zip = new JSZip();
    zip.file('page-screenshot.png', 'png');
    const safePackage = await zip.generateAsync({ type: 'blob' });
    mocks.readFile
      .mockResolvedValueOnce(
        new File(['hostile-package'], 'snapshot.zip', { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE })
      )
      .mockResolvedValueOnce(new File(['png'], 'screenshot.png', { type: 'image/png' }));
    mocks.validateRetainedScreenshot.mockResolvedValue({ height: 720, width: 1280 });
    mocks.sanitizeSnapshot.mockResolvedValue({
      changed: true,
      manifest: safeManifest,
      packageBlob: safePackage,
      size: safePackage.size,
    });
    mocks.writeBlob.mockResolvedValue({
      ref: {
        assetId: 'safe-package',
        createdAt: 2,
        location: { kind: 'opfs', objectKey: 'objects/safe-package' },
        mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
        sha256: null,
        size: safePackage.size,
      },
    });
    mocks.discard.mockResolvedValue(undefined);
    const packageObject = {
      objectId: 'package-object',
      ref: {
        assetId: 'hostile-package',
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: 'objects/hostile-package' },
        mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
        sha256: null,
        size: 15,
      },
    };
    const screenshotObject = {
      objectId: 'screenshot-object',
      ref: {
        assetId: 'screenshot',
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: 'objects/screenshot' },
        mimeType: 'image/png',
        sha256: null,
        size: 5,
      },
    };

    const result = await mediaLibraryRootPublisher.prepareStaged!({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/snapshot.json',
          objectCount: 2,
          rootId: 'snapshot',
          rootKind: 'media',
          totalBytes: 20,
        },
        metadata: portableJson({
          entry: {
            createdAt: 1,
            duration: null,
            filename: 'snapshot.sniptale-page-package.zip',
            height: 80,
            id: 'snapshot',
            kind: 'web-archive',
            mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
            originalFilename: 'snapshot.sniptale-page-package.zip',
            size: 15,
            source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
            sourceFavicon: null,
            sourceTitle: null,
            sourceUrl: null,
            tags: [],
            updatedAt: 2,
            width: 100,
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
      staged: [packageObject, screenshotObject],
    });

    expect(mocks.sanitizeSnapshot).toHaveBeenCalledWith(expect.any(File), stored.manifest, {
      requireManifestMatch: true,
    });
    expect(mocks.discard).toHaveBeenCalledWith('hostile-package');
    expect(result.staged[0]?.ref.assetId).toBe('safe-package');
    expect(result.envelope.metadata).toMatchObject({
      entry: { size: safePackage.size },
      webSnapshot: { entry: { manifest: safeManifest, size: safePackage.size } },
    });
  });
});

describe('media v6 web snapshot hostile screenshot rejection', () => {
  it.each([
    'Web snapshot screenshot is invalid.',
    'Web snapshot screenshot dimensions exceed safe limits.',
    'Web snapshot retained screenshot does not match the package.',
  ])(
    'rejects unsafe retained screenshot roots before replacement or publication: %s',
    async (message) => {
      const manifest = createWebSnapshotManifest({
        id: 'snapshot',
        source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
      });
      const zip = new JSZip();
      zip.file('page-screenshot.png', 'png');
      const packageBlob = await zip.generateAsync({ type: 'blob' });
      mocks.readFile
        .mockResolvedValueOnce(
          new File([packageBlob], 'snapshot.zip', { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE })
        )
        .mockResolvedValueOnce(new File(['unsafe'], 'screenshot.png', { type: 'image/png' }));
      mocks.sanitizeSnapshot.mockResolvedValue({
        changed: false,
        manifest,
        packageBlob,
        size: packageBlob.size,
      });
      mocks.validateRetainedScreenshot.mockRejectedValue(new Error(message));

      await expect(
        mediaLibraryRootPublisher.prepareStaged!({
          envelope: {
            descriptor: {
              mediaSubtype: 'library-item',
              metadataPath: '_sniptale/metadata/media/snapshot.json',
              objectCount: 2,
              rootId: 'snapshot',
              rootKind: 'media',
              totalBytes: packageBlob.size + 6,
            },
            metadata: portableJson({
              entry: {
                createdAt: 1,
                duration: null,
                filename: 'snapshot.sniptale-page-package.zip',
                height: 720,
                id: 'snapshot',
                kind: 'web-archive',
                mimeType: 'application/x-sniptale-page-package+zip',
                originalFilename: 'snapshot.sniptale-page-package.zip',
                size: packageBlob.size,
                source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
                sourceFavicon: null,
                sourceTitle: 'Snapshot',
                sourceUrl: 'https://example.com/',
                tags: [],
                updatedAt: 1,
                width: 1280,
              },
              originalObjectId: 'package-object',
              webSnapshot: {
                entry: {
                  createdAt: 1,
                  id: 'snapshot',
                  manifest,
                  screenshotMimeType: 'image/png',
                  screenshotSize: 6,
                  size: packageBlob.size,
                  updatedAt: 1,
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
                size: packageBlob.size,
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
                size: 6,
              },
            },
          ],
        })
      ).rejects.toThrow(message);

      expect(mocks.writeBlob).not.toHaveBeenCalled();
      expect(mocks.discard).not.toHaveBeenCalled();
      expect(mocks.checkpoint).not.toHaveBeenCalled();
      expect(mocks.runMutation).not.toHaveBeenCalled();
    }
  );
});

describe('media v6 web snapshot role validation', () => {
  it.each([
    ['text/javascript', 'image/png', 'package MIME type is invalid'],
    ['APPLICATION/X-SNIPTALE-PAGE-PACKAGE+ZIP', 'image/png', 'package MIME type is invalid'],
    [PAGE_PACKAGE_ARCHIVE_MIME_TYPE, 'image/webp', 'screenshot MIME type is invalid'],
    [PAGE_PACKAGE_ARCHIVE_MIME_TYPE, 'IMAGE/PNG', 'screenshot MIME type is invalid'],
  ])(
    'rejects role-inappropriate nested MIME types before publication: %s / %s',
    async (packageMimeType, screenshotMimeType, message) => {
      const stored = createCleanupWebSnapshotRecord('snapshot');
      stored.manifest = createWebSnapshotManifest({
        id: 'snapshot',
        source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
      });
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
                mimeType: packageMimeType,
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
                mimeType: screenshotMimeType,
                sha256: null,
                size: 1,
              },
            },
          ],
        })
      ).rejects.toThrow(message);
    }
  );
});
