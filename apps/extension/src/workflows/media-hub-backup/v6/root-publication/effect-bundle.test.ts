import { describe, expect, it, vi } from 'vitest';
import type {
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../../composition/persistence/assets';

const mocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  put: vi.fn(),
  readFile: vi.fn(),
  runMutation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  readAssetFile: mocks.readFile,
}));
vi.mock(
  '../../../../composition/persistence/effect-bundles/backup-restore',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/effect-bundles/backup-restore')
    >()),
    putEffectBundleBackupRestore: mocks.put,
  })
);
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { effectBundleRootPublisher } from './effect-bundle';

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
  currentRoot: 'media:effect-bundle:bundle-one',
  kind: 'archive-restore-session' as const,
  operationId: 'restore-1',
  rootIdMap: {},
  skippedRoots: [],
  status: 'pending' as const,
  strategy: 'replace' as const,
  updatedAt: 1,
} satisfies ArchiveRestoreSession;

describe('effect bundle v6 root publication', () => {
  it('publishes the catalog and session checkpoint in one caller-owned transaction', async () => {
    const stores = new Map<string, object>();
    const tx = {
      done: Promise.resolve(),
      objectStore: vi.fn((name: string) => {
        const store = stores.get(name) ?? {};
        stores.set(name, store);
        return store;
      }),
    };
    mocks.runMutation.mockImplementation(async (callback) =>
      callback({ transaction: vi.fn(() => tx) })
    );
    mocks.readFile.mockResolvedValue(new File(['image'], 'asset', { type: 'image/png' }));
    mocks.put.mockResolvedValue({ conflicted: false, imported: true, packId: 'bundle-one' });
    mocks.checkpoint.mockResolvedValue(undefined);
    const metadata = {
      entry: {
        assets: [
          {
            byteLength: 5,
            kind: 'image',
            mimeType: 'image/png',
            objectId: 'object-one',
            sha256: 'a'.repeat(64),
          },
        ],
        createdAt: 1,
        description: { en: '', ru: '' },
        documents: [
          {
            assets: [],
            id: 'effect',
            kind: 'standalone',
            schemaVersion: 'sniptale.effect.v1',
            sha256: 'b'.repeat(64),
            source: '{}',
          },
        ],
        enabled: true,
        label: { en: 'Bundle', ru: 'Набор' },
        packId: 'bundle-one',
        retainedByteLength: 5,
        source: 'bundle-zip',
        sourceSha256: 'c'.repeat(64),
        updatedAt: 2,
        version: '1',
      },
    };
    await expect(
      effectBundleRootPublisher.publish({
        envelope: {
          descriptor: {
            mediaSubtype: 'effect-bundle',
            metadataPath: 'metadata/media/bundle-one.json',
            objectCount: 1,
            rootId: 'bundle-one',
            rootKind: 'media',
            totalBytes: 5,
          },
          metadata,
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
      })
    ).resolves.toEqual({ conflicted: false, imported: true, retainedAssetIds: [] });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.checkpoint).toHaveBeenCalledWith(
      expect.anything(),
      'restore-1',
      'media:effect-bundle:bundle-one',
      'bundle-one',
      true,
      false
    );
    expect(tx.objectStore).toHaveBeenCalledWith('video_effect_bundles');
    expect(tx.objectStore).toHaveBeenCalledWith('asset_operations');
  });
});
