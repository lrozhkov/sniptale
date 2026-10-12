import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from './index.test-support';
import type { AssetReadyJournal } from '../assets/contracts';
const mocks = vi.hoisted(() => ({ runMutation: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  publishProjectAssetJournal,
  projectAssetPublicationAdapter,
} from './asset-publication';
const ref = {
  assetId: 'asset-new',
  createdAt: 2,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-new' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};
const exportEntry = {
  assetId: ref.assetId,
  createdAt: 2,
  duration: 4,
  filename: 'export.webm',
  fps: 30,
  height: 720,
  id: 'export-1',
  mimeType: ref.mimeType,
  projectId: 'project-1',
  size: ref.size,
  width: 1280,
};
beforeEach(() => {
  vi.clearAllMocks();
});
function createJournal(domain: string, payload: unknown): AssetReadyJournal {
  return { assetRefs: [ref], createdAt: 2, domain, journalId: 'journal-1', payload };
}
function createTransaction(
  writes: Array<[string, 'delete' | 'put', unknown]>,
  done: Promise<unknown>
) {
  return {
    done,
    abort: vi.fn(),
    objectStore(name: string) {
      return {
        get: vi.fn(async (_key: unknown): Promise<unknown> => undefined),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
        delete: vi.fn(async (value: unknown) => writes.push([name, 'delete', value])),
        index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
      };
    },
  };
}

it.each(['trash', 'changed-ref'] as const)(
  'refuses unaccepted known-source acquisition after %s without writes',
  async (failure) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const media = createMediaLibraryEntry({
      id: 'export:one',
      kind: 'export',
      source: {
        kind: 'project-export',
        exportId: exportEntry.id,
        projectId: exportEntry.projectId,
      },
      size: ref.size,
      mimeType: ref.mimeType,
      ...(failure === 'trash'
        ? { lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 3 } }
        : {}),
    });
    const transaction = createTransaction(writes, Promise.resolve());
    const original = transaction.objectStore;
    transaction.objectStore = (name) => ({
      ...original(name),
      get: vi.fn(async (key: unknown) => {
        if (name === 'media_library') return key === media.id ? media : undefined;
        if (name === 'project_exports') return exportEntry;
        if (name === 'asset_refs')
          return failure === 'changed-ref'
            ? { ...ref, location: { ...ref.location, objectKey: 'objects/replaced' } }
            : ref;
        return undefined;
      }),
    });
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => transaction })
    );
    const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry: {
        id: 'private-known',
        assetId: ref.assetId,
        createdAt: 2,
        size: ref.size,
        mimeType: ref.mimeType,
        originMediaId: media.id,
      },
      filename: 'copy.webm',
      expectedAssetId: null,
      publishToLibrary: false,
      expectedLibrarySource: { mediaId: media.id, source: media.source },
    });
    await expect(publishProjectAssetJournal(journal)).rejects.toThrow();
    expect(writes).toEqual([]);
  }
);

it.each(['trash', 'deleted'] as const)(
  'recovers exact known-source accepted replay after origin %s',
  async (mode) => {
    const writes: Array<[string, 'delete' | 'put', unknown]> = [];
    const entry = {
      id: 'private-known',
      assetId: ref.assetId,
      createdAt: 2,
      size: ref.size,
      mimeType: ref.mimeType,
      originMediaId: 'export:one',
    };
    const transaction = createTransaction(writes, Promise.resolve());
    const original = transaction.objectStore;
    transaction.objectStore = (name) => ({
      ...original(name),
      get: vi.fn(async (key: unknown) => {
        if (name === 'project_assets') return entry;
        if (name === 'asset_refs') return ref;
        if (name === 'asset_owners')
          return {
            assetId: ref.assetId,
            ownerId: entry.id,
            ownerKind: 'project-asset',
            role: 'body',
          };
        if (name === 'media_library' && key === entry.originMediaId && mode === 'trash')
          return { lifecycle: { trashedAt: 3 } };
        return undefined;
      }),
    });
    mocks.runMutation.mockImplementation(async (operation) =>
      operation({ transaction: () => transaction })
    );
    await projectAssetPublicationAdapter.publish(
      createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
        entry,
        filename: 'copy.webm',
        expectedAssetId: null,
        publishToLibrary: false,
        expectedLibrarySource: {
          mediaId: entry.originMediaId,
          source: {
            kind: 'project-export',
            exportId: exportEntry.id,
            projectId: exportEntry.projectId,
          },
        },
      })
    );
    expect(writes).toEqual([]);
  }
);
