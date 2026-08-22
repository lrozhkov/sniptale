import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completePhysicalDelete: vi.fn(),
  collectWriting: vi.fn(),
  deleteObject: vi.fn(),
  deleteJournal: vi.fn(),
  journals: vi.fn(),
  objects: vi.fn(),
  writing: vi.fn(),
  recoverStandalone: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: mocks.completePhysicalDelete,
  collectQuiescentWritingObjects: mocks.collectWriting,
  deleteAssetObject: mocks.deleteObject,
  deleteReadyJournal: mocks.deleteJournal,
  listReadyJournals: mocks.journals,
  listAssetObjectIds: mocks.objects,
  listWritingAssetIds: mocks.writing,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/asset-publication')>()),
  RECORDING_ASSET_OWNER_KIND: 'recording',
  RECORDING_ASSET_ROLE: 'body',
  recordingAssetPublicationAdapter: { domain: 'recording-assets', publish: vi.fn() },
}));

import { recoverAssetPublications } from './index';
import type {
  ArchiveRestoreSession,
  AssetOperation,
  PhysicalDeleteAssetOperation,
} from '../assets';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completePhysicalDelete.mockResolvedValue(undefined);
  mocks.collectWriting.mockResolvedValue(0);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.journals.mockResolvedValue([]);
  mocks.objects.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.recoverStandalone.mockResolvedValue(0);
});

it('retries durable physical-delete operations on startup', async () => {
  const operation: PhysicalDeleteAssetOperation = {
    assetIds: ['orphan-1'],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.completePhysicalDelete).toHaveBeenCalledWith(operation);
  expect(mocks.recoverStandalone).toHaveBeenCalledOnce();
});

it('aborts and compensates a crashed restore before removing its uncommitted object', async () => {
  const previousRecording = {
    assetId: 'asset-old',
    createdAt: 1,
    filename: 'old.webm',
    id: 'recording-1',
    mimeType: 'video/webm',
    size: 3,
  };
  const previousRef = {
    assetId: 'asset-old',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset-old' },
    mimeType: 'video/webm',
    sha256: null,
    size: 3,
  };
  const previousOwner = {
    assetId: 'asset-old',
    ownerId: 'recording-1',
    ownerKind: 'recording',
    role: 'body',
  };
  const operation: AssetOperation = {
    compensations: [
      {
        assetId: 'asset-new',
        journalId: 'journal-1',
        nextMediaId: 'recording:recording-1',
        nextOwnerId: 'recording-1',
        previousRecords: {
          assetOwnerEntry: previousOwner,
          assetRefEntry: previousRef,
          recordingEntry: previousRecording,
        },
      },
    ],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['asset-old'],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  harness.put('recordings', 'recording-1', { ...previousRecording, assetId: 'asset-new' });
  harness.put('asset_refs', 'asset-new', { assetId: 'asset-new' });
  harness.put('asset_owners', ['recording', 'recording-1', 'body'], {
    ...previousOwner,
    assetId: 'asset-new',
  });
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [{ ...previousRef, assetId: 'asset-new' }],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'journal-1',
      operationId: 'restore-1',
      payload: {},
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(harness.get('recordings', 'recording-1')).toEqual(previousRecording);
  expect(harness.get('asset_refs', 'asset-old')).toEqual(previousRef);
  expect(harness.get('asset_refs', 'asset-new')).toBeUndefined();
  expect(harness.get('asset_operations', 'restore-1')).toBeUndefined();
  expect(mocks.deleteObject).toHaveBeenCalledWith('asset-new');
  expect(mocks.deleteObject).not.toHaveBeenCalledWith('asset-old');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-1');
});

it('restores a replaced project asset and thumbnail after a later restore batch crashes', async () => {
  const previousProjectAsset = {
    assetId: 'asset-old',
    createdAt: 1,
    id: 'project-asset-1',
    mimeType: 'image/png',
    size: 3,
  };
  const previousMedia = { id: 'project-asset:project-asset-1', filename: 'old.png' };
  const previousThumbnail = { id: 'project-asset:project-asset-1', blob: new Blob(['old']) };
  const previousRef = {
    assetId: 'asset-old',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset-old' },
    mimeType: 'image/png',
    sha256: null,
    size: 3,
  };
  const previousOwner = {
    assetId: 'asset-old',
    ownerId: 'project-asset-1',
    ownerKind: 'project-asset',
    role: 'body',
  };
  const operation: AssetOperation = {
    compensations: [
      {
        assetId: 'asset-new',
        journalId: 'journal-project-asset',
        nextMediaId: 'project-asset:project-asset-1',
        nextOwnerId: 'project-asset-1',
        nextProjectAssetId: 'project-asset-1',
        ownerKind: 'project-asset',
        ownerRole: 'body',
        previousRecords: {
          assetOwnerEntry: previousOwner,
          assetRefEntry: previousRef,
          mediaLibraryEntry: previousMedia,
          projectAssetEntry: previousProjectAsset,
          thumbnailEntry: previousThumbnail,
        },
      },
    ],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['asset-old'],
    operationId: 'restore-project-asset',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  harness.put('project_assets', 'project-asset-1', {
    ...previousProjectAsset,
    assetId: 'asset-new',
  });
  harness.put('media_library', previousMedia.id, { ...previousMedia, filename: 'new.png' });
  harness.put('thumbnails', previousThumbnail.id, {
    id: previousThumbnail.id,
    blob: new Blob(['new']),
  });
  harness.put('asset_refs', 'asset-new', { assetId: 'asset-new' });
  harness.put('asset_owners', ['project-asset', 'project-asset-1', 'body'], {
    ...previousOwner,
    assetId: 'asset-new',
  });
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(harness.get('project_assets', 'project-asset-1')).toEqual(previousProjectAsset);
  expect(harness.get('media_library', previousMedia.id)).toEqual(previousMedia);
  expect(harness.get('thumbnails', previousThumbnail.id)).toEqual(previousThumbnail);
  expect(harness.get('asset_refs', 'asset-old')).toEqual(previousRef);
  expect(harness.get('asset_refs', 'asset-new')).toBeUndefined();
  expect(mocks.deleteObject).toHaveBeenCalledWith('asset-new');
  expect(mocks.deleteObject).not.toHaveBeenCalledWith('asset-old');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-project-asset');
});

it('restores both previous web snapshot assets after a crashed restore root', async () => {
  const previousWebSnapshot = {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: {},
    packageAssetId: 'package-old',
    screenshotAssetId: 'screenshot-old',
    screenshotMimeType: 'image/png',
    screenshotSize: 4,
    size: 5,
    updatedAt: 1,
  };
  const previousMedia = { id: 'snapshot-1', filename: 'old.zip' };
  const previousThumbnail = { assetId: 'snapshot-1', blob: new Blob(['old']) };
  const previousRefs = [createRef('package-old'), createRef('screenshot-old')];
  const previousOwners = [
    {
      assetId: 'package-old',
      ownerId: 'snapshot-1',
      ownerKind: 'web-snapshot',
      role: 'package',
    },
    {
      assetId: 'screenshot-old',
      ownerId: 'snapshot-1',
      ownerKind: 'web-snapshot',
      role: 'screenshot',
    },
  ];
  const previousRecords = {
    assetOwnerEntries: previousOwners,
    assetRefEntries: previousRefs,
    mediaLibraryEntry: previousMedia,
    thumbnailEntry: previousThumbnail,
    webSnapshotEntry: previousWebSnapshot,
  };
  const operation: AssetOperation = {
    compensations: [
      createWebSnapshotCompensation('package-new', 'package', previousRecords),
      createWebSnapshotCompensation('screenshot-new', 'screenshot', previousRecords),
    ],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['package-old', 'screenshot-old'],
    operationId: 'restore-web-snapshot',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  harness.put('web_snapshots', 'snapshot-1', {
    ...previousWebSnapshot,
    packageAssetId: 'package-new',
    screenshotAssetId: 'screenshot-new',
  });
  harness.put('asset_refs', 'package-new', createRef('package-new'));
  harness.put('asset_refs', 'screenshot-new', createRef('screenshot-new'));
  harness.put('asset_owners', ['web-snapshot', 'snapshot-1', 'package'], {
    ...previousOwners[0],
    assetId: 'package-new',
  });
  harness.put('asset_owners', ['web-snapshot', 'snapshot-1', 'screenshot'], {
    ...previousOwners[1],
    assetId: 'screenshot-new',
  });
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(harness.get('web_snapshots', 'snapshot-1')).toEqual(previousWebSnapshot);
  expect(harness.get('asset_refs', 'package-old')).toEqual(previousRefs[0]);
  expect(harness.get('asset_refs', 'screenshot-old')).toEqual(previousRefs[1]);
  expect(harness.get('asset_refs', 'package-new')).toBeUndefined();
  expect(harness.get('asset_refs', 'screenshot-new')).toBeUndefined();
  expect(mocks.deleteObject).toHaveBeenCalledWith('package-new');
  expect(mocks.deleteObject).toHaveBeenCalledWith('screenshot-new');
});

it('finishes journals and obsolete objects for a committed restore', async () => {
  const operation: AssetOperation = {
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['asset-old'],
    operationId: 'restore-committed',
    status: 'committed',
    updatedAt: 2,
  };
  const harness = createDbHarness([operation]);
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'journal-committed',
      operationId: 'restore-committed',
      payload: {},
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-committed');
  expect(mocks.deleteObject).toHaveBeenCalledWith('asset-old');
  expect(harness.get('asset_operations', 'restore-committed')).toBeUndefined();
});

it('keeps a crashed archive session resumable while removing only its uncommitted root', async () => {
  const session: ArchiveRestoreSession = {
    archiveFingerprint: 'a'.repeat(64),
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: 'media:library-item:one',
    kind: 'archive-restore-session',
    operationId: 'archive-restore',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: 'duplicate',
    updatedAt: 2,
  };
  const harness = createDbHarness([session]);
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [createRef('uncommitted-object')],
      createdAt: 1,
      domain: 'archive-restore-root',
      journalId: 'archive-journal',
      operationId: session.operationId,
      payload: { rootKey: session.currentRoot },
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.deleteObject).toHaveBeenCalledWith('uncommitted-object');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('archive-journal');
  expect(harness.get('asset_operations', session.operationId)).toMatchObject({
    currentRoot: null,
    status: 'pending',
  });
});

it('never deletes a referenced object while cleaning a committed multi-object archive journal', async () => {
  const rootKey = 'media:library-item:one';
  const session: ArchiveRestoreSession = {
    archiveFingerprint: 'b'.repeat(64),
    committedRoots: [rootKey],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: 'archive-committed-root',
    rootIdMap: { [rootKey]: 'one' },
    skippedRoots: [],
    status: 'pending',
    strategy: 'replace',
    updatedAt: 2,
  };
  const harness = createDbHarness([session]);
  harness.put('asset_refs', 'retained-object', createRef('retained-object'));
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [createRef('temporary-object'), createRef('retained-object')],
      createdAt: 1,
      domain: 'archive-restore-root',
      journalId: 'committed-journal',
      operationId: session.operationId,
      payload: { rootKey },
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.deleteObject).toHaveBeenCalledWith('temporary-object');
  expect(mocks.deleteObject).not.toHaveBeenCalledWith('retained-object');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('committed-journal');
});

function createDbHarness(
  operations: Array<AssetOperation | ArchiveRestoreSession | PhysicalDeleteAssetOperation>
) {
  const stores = new Map<string, Map<string, unknown>>();
  const key = (value: unknown) => JSON.stringify(value);
  const put = (storeName: string, entryKey: unknown, value: unknown) => {
    let store = stores.get(storeName);
    if (!store) {
      store = new Map();
      stores.set(storeName, store);
    }
    store.set(key(entryKey), value);
  };
  for (const operation of operations) put('asset_operations', operation.operationId, operation);
  const deriveKey = (storeName: string, value: Record<string, unknown>) => {
    if (storeName === 'asset_operations') return value['operationId'];
    if (storeName === 'asset_refs') return value['assetId'];
    if (storeName === 'asset_owners') {
      return [value['ownerKind'], value['ownerId'], value['role']];
    }
    if (storeName === 'recording_telemetry') return value['recordingId'];
    return value['id'];
  };
  const objectStore = (storeName: string) => ({
    delete: async (entryKey: unknown) => stores.get(storeName)?.delete(key(entryKey)),
    get: async (entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put: async (value: Record<string, unknown>) =>
      put(storeName, deriveKey(storeName, value), value),
  });
  const db = {
    delete: async (storeName: string, entryKey: unknown) =>
      stores.get(storeName)?.delete(key(entryKey)),
    get: async (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    getAll: async (storeName: string) => [...(stores.get(storeName)?.values() ?? [])],
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore })),
  };
  return {
    db,
    get: (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put,
  };
}

function createRef(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'application/octet-stream',
    sha256: null,
    size: 3,
  };
}

function createWebSnapshotCompensation(
  assetId: string,
  ownerRole: string,
  previousRecords: Record<string, unknown>
): AssetOperation['compensations'][number] {
  return {
    assetId,
    journalId: 'journal-web-snapshot',
    nextMediaId: 'snapshot-1',
    nextOwnerId: 'snapshot-1',
    nextWebSnapshotId: 'snapshot-1',
    ownerKind: 'web-snapshot',
    ownerRole,
    previousRecords,
  };
}
