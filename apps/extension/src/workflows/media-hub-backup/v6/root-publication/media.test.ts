import { describe, expect, it, vi } from 'vitest';
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
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';
import { createCleanupWebSnapshotRecord } from '../../../media-hub/cleanup.test-support';
import { createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
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
          metadataPath: 'metadata/media/media-one.json',
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
    const safeManifest = {
      ...stored.manifest,
      source: { faviconUrl: null, title: null, url: null },
    };
    mocks.readFile.mockResolvedValue(
      new File(['hostile-package'], 'snapshot.zip', { type: 'application/zip' })
    );
    mocks.sanitizeSnapshot.mockResolvedValue({
      changed: true,
      manifest: safeManifest,
      packageBlob: new Blob(['safe-package'], { type: 'application/zip' }),
      size: 12,
    });
    mocks.writeBlob.mockResolvedValue({
      ref: {
        assetId: 'safe-package',
        createdAt: 2,
        location: { kind: 'opfs', objectKey: 'objects/safe-package' },
        mimeType: 'application/zip',
        sha256: null,
        size: 12,
      },
    });
    mocks.discard.mockResolvedValue(undefined);
    const packageObject = {
      objectId: 'package-object',
      ref: {
        assetId: 'hostile-package',
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: 'objects/hostile-package' },
        mimeType: 'application/zip',
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
          metadataPath: 'metadata/media/snapshot.json',
          objectCount: 2,
          rootId: 'snapshot',
          rootKind: 'media',
          totalBytes: 20,
        },
        metadata: portableJson({
          entry: {
            createdAt: 1,
            duration: null,
            filename: 'snapshot.png',
            height: 80,
            id: 'snapshot',
            kind: 'screenshot',
            mimeType: 'image/png',
            originalFilename: 'snapshot.png',
            size: 5,
            source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
            sourceFavicon: null,
            sourceTitle: null,
            sourceUrl: null,
            tags: [],
            updatedAt: 2,
            width: 100,
            workspaceRevision: 0,
          },
          originalObjectId: 'screenshot-object',
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
      webSnapshot: { entry: { manifest: safeManifest, size: 12 } },
    });
  });

  it('rejects role-inappropriate nested snapshot MIME types before publication', async () => {
    const stored = createCleanupWebSnapshotRecord('snapshot');
    stored.manifest = createWebSnapshotManifest({
      id: 'snapshot',
      source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
    });
    await expect(
      mediaLibraryRootPublisher.prepareStaged!({
        envelope: {
          descriptor: {
            mediaSubtype: 'library-item',
            metadataPath: 'metadata/media/snapshot.json',
            objectCount: 2,
            rootId: 'snapshot',
            rootKind: 'media',
            totalBytes: 2,
          },
          metadata: portableJson({
            entry: {
              createdAt: 1,
              duration: null,
              filename: 'snapshot.png',
              height: 1,
              id: 'snapshot',
              kind: 'screenshot',
              mimeType: 'image/png',
              originalFilename: 'snapshot.png',
              size: 1,
              source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
              sourceFavicon: null,
              sourceTitle: null,
              sourceUrl: null,
              tags: [],
              updatedAt: 1,
              width: 1,
            },
            originalObjectId: 'screenshot-object',
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
              mimeType: 'text/javascript',
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
              mimeType: 'video/mp4',
              sha256: null,
              size: 1,
            },
          },
        ],
      })
    ).rejects.toThrow('package MIME type is invalid');
  });
});
