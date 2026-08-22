import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDelete: vi.fn(),
  completeDelete: vi.fn(),
  recoverStandalone: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: mocks.buildDelete,
  completePhysicalDeleteOperation: mocks.completeDelete,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
}));

import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
  publishProjectAssetJournal,
  publishProjectExportJournal,
  recoverProjectMediaPublications,
} from './asset-publication';
import type { AssetReadyJournal } from '../assets';

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
  mocks.buildDelete.mockReturnValue({
    assetIds: [],
    createdAt: 2,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 2,
  });
  mocks.completeDelete.mockResolvedValue(undefined);
});

it('atomically publishes a direct project export ref, owner, row, and mirror', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const transaction = createTransaction(writes, Promise.resolve());
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await publishProjectExportJournal(
    createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, {
      entry: exportEntry,
    })
  );

  expect(writes).toContainEqual(['asset_refs', 'put', ref]);
  expect(writes).toContainEqual([
    'asset_owners',
    'put',
    {
      assetId: 'asset-new',
      ownerId: 'export-1',
      ownerKind: 'project-export',
      role: 'body',
    },
  ]);
  expect(writes).toContainEqual(['project_exports', 'put', exportEntry]);
  expect(writes).toContainEqual([
    'media_library',
    'put',
    expect.objectContaining({
      id: 'export:export-1',
      source: { exportId: 'export-1', kind: 'project-export', projectId: 'project-1' },
    }),
  ]);
  expect(writes).not.toContainEqual(['recordings', 'put', expect.anything()]);
});

it('does not physically delete a replaced object before the IDB transaction commits', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  const failure = new Error('commit failed');
  const transaction = createTransaction(writes, Promise.reject(failure), {
    ...exportEntry,
    assetId: 'asset-old',
  });
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await expect(
    publishProjectExportJournal(
      createJournal(PROJECT_EXPORT_PUBLICATION_DOMAIN, { entry: exportEntry })
    )
  ).rejects.toBe(failure);
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

it('publishes project assets with the archive filename and rejects workflow journals', async () => {
  const writes: Array<[string, 'delete' | 'put', unknown]> = [];
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => createTransaction(writes, Promise.resolve())) })
  );
  const entry = {
    assetId: ref.assetId,
    createdAt: 2,
    id: 'project-asset-1',
    mimeType: ref.mimeType,
    size: ref.size,
  };

  await publishProjectAssetJournal(
    createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, { entry, filename: 'clip.webm' })
  );
  expect(writes).toContainEqual([
    'media_library',
    'put',
    expect.objectContaining({ filename: 'clip.webm', id: 'project-asset:project-asset-1' }),
  ]);

  await expect(
    publishProjectAssetJournal({
      ...createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, { entry, filename: 'clip.webm' }),
      operationId: 'restore-1',
    })
  ).rejects.toThrow('Invalid standalone project asset publication journal');
});

it('registers only the two project media publication domains for standalone recovery', async () => {
  mocks.recoverStandalone.mockResolvedValue(2);

  await expect(recoverProjectMediaPublications()).resolves.toBe(2);
  expect(mocks.recoverStandalone).toHaveBeenCalledWith([
    expect.objectContaining({ domain: PROJECT_ASSET_PUBLICATION_DOMAIN }),
    expect.objectContaining({ domain: PROJECT_EXPORT_PUBLICATION_DOMAIN }),
  ]);
});

function createJournal(domain: string, payload: unknown): AssetReadyJournal {
  return {
    assetRefs: [ref],
    createdAt: 2,
    domain,
    journalId: 'journal-1',
    payload,
  };
}

function createTransaction(
  writes: Array<[string, 'delete' | 'put', unknown]>,
  done: Promise<unknown>,
  previous?: unknown
) {
  return {
    done,
    objectStore(name: string) {
      return {
        delete: vi.fn(async (value: unknown) => writes.push([name, 'delete', value])),
        get: vi
          .fn()
          .mockResolvedValue(
            name === 'project_assets' || name === 'project_exports' ? previous : undefined
          ),
        index: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
      };
    },
  };
}
