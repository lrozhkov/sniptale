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

import { publishRecordingAssetJournal } from './asset-publication';
import type { AssetReadyJournal } from '../assets';

const previous = {
  assetId: 'asset-old',
  createdAt: 1,
  filename: 'old.webm',
  id: 'recording-1',
  mimeType: 'video/webm',
  size: 3,
};
const entry = { ...previous, assetId: 'asset-new', filename: 'new.webm', size: 5 };
const ref = {
  assetId: 'asset-new',
  createdAt: 2,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-new' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
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

function journal(completion: AssetReadyJournal['payload'] extends never ? never : unknown = null) {
  return {
    assetRefs: [ref],
    createdAt: 2,
    domain: 'recording-assets',
    journalId: 'journal-1',
    payload: { completion, entries: [entry] },
  } satisfies AssetReadyJournal;
}

it('atomically publishes refs, owner, recording mirror, completion, and delete intent', async () => {
  const writes: Array<[string, 'add' | 'delete' | 'put', unknown]> = [];
  const transaction = createTransaction(writes, Promise.resolve());
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );
  const completion = {
    primaryRecordingId: 'recording-1',
    projectId: null,
    recordingId: 'session-1',
  };

  await publishRecordingAssetJournal(journal(completion));

  expect(writes).toContainEqual(['asset_refs', 'put', ref]);
  expect(writes).toContainEqual([
    'asset_owners',
    'put',
    {
      assetId: 'asset-new',
      ownerId: 'recording-1',
      ownerKind: 'recording',
      role: 'body',
    },
  ]);
  expect(writes).toContainEqual([
    'recordings',
    'put',
    expect.objectContaining({ assetId: 'asset-new' }),
  ]);
  expect(writes).toContainEqual([
    'asset_operations',
    'put',
    expect.objectContaining({ assetIds: ['asset-old'], kind: 'physical-delete' }),
  ]);
  expect(writes).toContainEqual([
    'state_manager',
    'add',
    expect.objectContaining({ domain: 'video-recording-completion-outbox' }),
  ]);
  expect(mocks.completeDelete).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['asset-old'] })
  );
});

it('does not physically delete an old object before the IDB transaction commits', async () => {
  const writes: Array<[string, 'add' | 'delete' | 'put', unknown]> = [];
  const transactionError = new Error('commit failed');
  const transaction = createTransaction(writes, Promise.reject(transactionError));
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await expect(publishRecordingAssetJournal(journal())).rejects.toBe(transactionError);
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

it('replays a committed publication with the exact completion outbox idempotently', async () => {
  const writes: Array<[string, 'add' | 'delete' | 'put', unknown]> = [];
  const completion = {
    primaryRecordingId: 'recording-1',
    projectId: null,
    recordingId: 'session-1',
  };
  const transaction = createTransaction(writes, Promise.resolve(), completionOutbox(completion));
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await publishRecordingAssetJournal(journal(completion));

  expect(writes).not.toContainEqual(['state_manager', 'add', expect.anything()]);
});

it('rejects replay when a different completion is already pending', async () => {
  const writes: Array<[string, 'add' | 'delete' | 'put', unknown]> = [];
  const completion = {
    primaryRecordingId: 'recording-1',
    projectId: null,
    recordingId: 'session-1',
  };
  const transaction = createTransaction(
    writes,
    Promise.resolve(),
    completionOutbox({ ...completion, recordingId: 'other-session' })
  );
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => transaction) })
  );

  await expect(publishRecordingAssetJournal(journal(completion))).rejects.toThrow(
    'different video recording completion'
  );
});

function completionOutbox(completion: {
  primaryRecordingId: string;
  projectId: string | null;
  recordingId: string;
}) {
  return {
    domain: 'video-recording-completion-outbox',
    key: 'pending',
    updatedAtEpochMs: 1,
    value: { ...completion, version: 1 },
  };
}

function createTransaction(
  writes: Array<[string, 'add' | 'delete' | 'put', unknown]>,
  done: Promise<unknown>,
  stateManagerValue?: unknown
) {
  return {
    done,
    objectStore(name: string) {
      return {
        add: vi.fn(async (value: unknown) => writes.push([name, 'add', value])),
        delete: vi.fn(async (value: unknown) => writes.push([name, 'delete', value])),
        get: vi
          .fn()
          .mockResolvedValue(
            name === 'recordings'
              ? previous
              : name === 'state_manager'
                ? stateManagerValue
                : undefined
          ),
        index: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
      };
    },
  };
}
