import {
  retireImageWorkspaceIdentity,
  restoreImageWorkspaceIdentity,
} from '../image-workspaces/identity';
import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withIndexedRowProjections } from '../infrastructure/indexed-db/indexed-row-projections';
import { ROW_REFERENCE_INDEX } from '../infrastructure/indexed-db/row-index-contract';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../../features/editor/document/public';
import {
  encodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
} from '../../../features/editor-history/image-snapshot';
import type {
  EditorImageHistoryCheckpoint,
  EditorImageHistoryValue,
} from '../../../features/editor-history/image-checkpoint';
import type { AssetReadyJournal, AssetRef } from '../assets/contracts';
import {
  commitImageWorkspace,
  createImageWorkspaceCommit,
  imageWorkspacePublicationAdapter,
  commitImagePresentation,
  promoteImageAggregate,
  restoreImageAggregateOriginal,
  saveImageAggregateCopyFromDocument,
  copyImageAggregate,
} from './mutations';
import {
  readImageOriginalSource,
  readImageWorkspace,
  readStoredImageWorkspace,
} from '../image-workspaces/read';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { putImageWorkspaceBackupRestore } from '../image-workspaces/backup-restore';
import { parseAssetRef } from '../assets/guards';
import { imageWorkspaceAssetBindings } from '../image-workspaces/assets';
import { parseSyncCaptureRecord } from '../sync-capture/guards';

const io = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  sequence: 0,
  files: new Map<string, Blob>(),
  journals: new Map<string, AssetReadyJournal>(),
  beforePublish: null as ((journal: AssetReadyJournal) => Promise<void>) | null,
  loseAck: false,
  write: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => {
    if (!io.db) throw new Error('Test database is not open');
    return io.db;
  },
}));

vi.mock('../assets', async (original) => {
  const module = await original<typeof import('../assets')>();
  return {
    ...module,
    writeBlobToAsset: io.write,
    readAssetFile: io.read,
    recoverStandaloneAssetPublications: async () => 0,
    releaseAssetReadyProtection: async () => undefined,
    completePhysicalDeleteOperation: async () => undefined,
    collectPreparedAssetCleanupFailures: async (ids: readonly string[]) => {
      for (const id of ids) io.files.delete(id);
      return [];
    },
    cancelAssetPublication: async (journal: AssetReadyJournal) => {
      for (const ref of journal.assetRefs) io.files.delete(ref.assetId);
      io.journals.delete(journal.journalId);
    },
    createAssetPublicationJournal: async (
      input: Parameters<typeof module.createAssetPublicationJournal>[0]
    ) => {
      const journal: AssetReadyJournal = {
        ...input,
        assetRefs: [...input.assetRefs],
        journalId: crypto.randomUUID(),
        createdAt: 1,
      };
      io.journals.set(journal.journalId, journal);
      return journal;
    },
    publishReadyJournalWithRetry: async (
      journal: AssetReadyJournal,
      publish: (journal: AssetReadyJournal) => Promise<void>
    ) => {
      await io.beforePublish?.(journal);
      await publish(journal);
      if (io.loseAck) {
        io.loseAck = false;
        throw new Error('Lost acknowledgement');
      }
      io.journals.delete(journal.journalId);
    },
  };
});

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: async () => new Blob(['thumbnail'], { type: 'image/png' }),
}));
vi.mock('../../../platform/media-utils/data-url', async (original) => ({
  ...(await original<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: async (blob: Blob) =>
    `data:${blob.type};base64,${btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))}`,
}));

let raw: IDBPDatabase;
let databaseName: string;

function database() {
  if (!io.db) throw new Error('Test database is not open');
  return io.db;
}

const source = 'data:image/png;base64,' + 'QUJD'.repeat(2_100) + 'RA==';
function document(name: string): EditorDocument {
  return {
    version: 2,
    sourceImageData: source,
    sourceName: null,
    displayName: name,
    sourceWidth: 20,
    sourceHeight: 20,
    canvasWidth: 20,
    canvasHeight: 20,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 20,
    sourceDisplayHeight: 20,
    frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS },
    canvasJson: '{"objects":[]}',
  };
}

function history(
  names = ['Original', 'First', 'Second'],
  cursor = 1
): EditorImageHistoryCheckpoint {
  const values: EditorImageHistoryValue[] = [];
  const ids = new Map<string, string>();
  const snapshots = names.map((name) =>
    encodeEditorImageHistorySnapshot(
      document(name),
      {
        intern(value, kind) {
          const found = ids.get(value);
          if (found) return found;
          const id = IMAGE_HISTORY_VALUE_TOKEN_PREFIX + ids.size;
          ids.set(value, id);
          values.push({ id, kind, value });
          return id;
        },
      },
      new Set()
    )
  );
  return {
    version: 1,
    epoch: 'native-epoch',
    cursor,
    snapshots,
    values,
    actions: names.map((_, index) => (index ? { operation: 'rename', target: null } : null)),
  };
}

function gate() {
  let release: () => void = () => {
    throw new Error('Gate is not installed');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

beforeEach(async () => {
  vi.clearAllMocks();
  io.sequence = 0;
  io.files.clear();
  io.journals.clear();
  io.beforePublish = null;
  io.loseAck = false;
  databaseName = `image-history-${crypto.randomUUID()}`;
  raw = await openDB(databaseName, 1, {
    upgrade(db) {
      db.createObjectStore('media_library', { keyPath: 'id' }).createIndex(
        ROW_REFERENCE_INDEX,
        '__sniptaleRetentionIndexV1',
        { multiEntry: true }
      );
      db.createObjectStore('image_workspace_identities', { keyPath: 'aggregateId' });
      db.createObjectStore('project_assets', { keyPath: 'id' });
      db.createObjectStore('image_workspaces', { keyPath: 'aggregateId' }).createIndex(
        ROW_REFERENCE_INDEX,
        '__sniptaleRetentionIndexV1',
        { multiEntry: true }
      );
      db.createObjectStore('aggregate_presentations', {
        keyPath: ['aggregateKind', 'aggregateId'],
      });
      db.createObjectStore('asset_refs', { keyPath: 'assetId' });
      db.createObjectStore('asset_owners', {
        keyPath: ['ownerKind', 'ownerId', 'role'],
      }).createIndex('assetId', 'assetId');
      db.createObjectStore('asset_operations', { keyPath: 'operationId' });
      db.createObjectStore('asset_residency', { keyPath: 'id' });
      db.createObjectStore('sync_capture', { keyPath: 'key' });
    },
  });
  io.db = withIndexedRowProjections(raw);
  await database().put('media_library', {
    id: 'image',
    kind: 'image',
    filename: 'image.png',
    originalFilename: 'image.png',
    mimeType: 'image/png',
    size: 8,
    blob: new Blob(['original'], { type: 'image/png' }),
    source: { kind: 'screenshot' },
    width: 20,
    height: 20,
    duration: null,
    createdAt: 1,
    updatedAt: 1,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    workspaceRevision: 0,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  io.write.mockReset().mockImplementation(async (blob: Blob) => {
    const assetId = `native-history-${++io.sequence}`;
    io.files.set(assetId, blob);
    return {
      ref: {
        assetId,
        createdAt: 1,
        mimeType: blob.type,
        size: blob.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      },
    };
  });
  io.read.mockReset().mockImplementation(async (ref: AssetRef, filename: string) => {
    const file = io.files.get(ref.assetId);
    if (!file) throw new Error('Immutable bytes are missing');
    return new File([file], filename, { type: file.type });
  });
});

afterEach(async () => {
  raw.close();
  io.db = null;
  await deleteDB(databaseName);
});

it('publishes document, history, cursor, redo and every byte owner in one native transaction', async () => {
  const checkpoint = history();
  const saved = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: checkpoint,
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  expect(saved.revision).toBe(1);
  const stored = await readStoredImageWorkspace('image');
  expect(stored?.history?.cursor).toBe(1);
  const opened = await readImageWorkspace('image');
  expect(opened?.document).toEqual(document('First'));
  expect(opened?.history).toEqual(checkpoint);
  const owners: unknown[] = await database().getAll('asset_owners');
  expect(owners).toHaveLength(imageWorkspaceAssetBindings(stored!).length);
  io.read.mockClear();
  io.write.mockClear();
  const next = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('Second'),
    history: { ...checkpoint, cursor: 2 },
    expectedRevision: 1,
    requireExistingRoot: true,
    reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
    reusableHistoryAssetsByValue: saved.historyAssetsByValue!,
  });
  expect(next.revision).toBe(2);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
  expect((await readStoredImageWorkspace('image'))?.history?.cursor).toBe(2);
});

it('preserves omitted history for metadata-only callers and clears it only on an explicit request', async () => {
  const saved = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const original = (await readStoredImageWorkspace('image'))!.history;
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    sourceTitle: 'New title',
    expectedRevision: 1,
    reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
  });
  expect((await readStoredImageWorkspace('image'))?.history).toEqual(original);
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: null,
    expectedRevision: 2,
    reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
  });
  const stored = (await readStoredImageWorkspace('image'))!;
  expect(stored.history).toBeUndefined();
  const owners: unknown[] = await database().getAll('asset_owners');
  expect(owners).toHaveLength(stored.document.assets.length);
});

it('commits only one history head for parallel writers at the same revision', async () => {
  const first = gate(),
    second = gate(),
    bothReady = gate();
  let prepared = 0;
  io.beforePublish = async () => {
    const position = ++prepared;
    if (prepared === 2) bothReady.release();
    await (position === 1 ? first : second).promise;
  };
  const a = commitImageWorkspace({
    aggregateId: 'image',
    document: document('A'),
    history: history(['Original', 'A'], 1),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const b = commitImageWorkspace({
    aggregateId: 'image',
    document: document('B'),
    history: history(['Original', 'B'], 1),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const settled = Promise.allSettled([a, b]);
  await bothReady.promise;
  first.release();
  await a;
  second.release();
  expect((await settled).map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
  const opened = await readImageWorkspace('image');
  expect(opened?.document.displayName).toBe('A');
  expect(opened?.history).toEqual(history(['Original', 'A'], 1));
  for (const journal of io.journals.values())
    await imageWorkspacePublicationAdapter.publish(journal);
  expect(io.journals.size).toBe(0);
});

it.each(
  (['presentation', 'promotion', 'original', 'copy'] as const).flatMap((command) => [
    { command, stale: true },
    { command, stale: false },
  ])
)(
  'checks the observed lifetime for $command after same-ID/revision restore, stale=$stale',
  async ({ command, stale }) => {
    await commitImageWorkspace({
      aggregateId: 'image',
      document: document('First'),
      history: history(),
      expectedRevision: 0,
      requireExistingRoot: true,
    });
    await commitImagePresentation({
      aggregateId: 'image',
      expectedWorkspaceRevision: 1,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    });
    const root = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
    const stored = (await readStoredImageWorkspace('image'))!;
    const tx = database().transaction(
      ['media_library', 'image_workspaces', 'image_workspace_identities'],
      'readwrite'
    );
    await retireImageWorkspaceIdentity(tx, 'image');
    await tx.objectStore('media_library').delete('image');
    await tx.objectStore('image_workspaces').delete('image');
    const restoredGeneration = await restoreImageWorkspaceIdentity(tx, 'image');
    const { publicationId: _receipt, ...restored } = stored;
    await tx.objectStore('media_library').put(root);
    await tx.objectStore('image_workspaces').put(restored);
    await tx.done;
    const before = await Promise.all(
      ['media_library', 'image_workspaces', 'aggregate_presentations', 'asset_owners'].map(
        (store) => database().getAll(store)
      )
    );
    const previewBlob = new Blob(['wrong old preview'], { type: 'image/png' });
    const thumbnailBlob = new Blob(['wrong old thumbnail'], { type: 'image/png' });
    const expectedGeneration = stale ? null : restoredGeneration;
    const pending =
      command === 'presentation'
        ? commitImagePresentation({
            aggregateId: 'image',
            expectedWorkspaceRevision: 1,
            expectedGeneration,
            previewBlob,
            thumbnailBlob,
          })
        : command === 'promotion'
          ? promoteImageAggregate('image', 1, expectedGeneration)
          : command === 'original'
            ? restoreImageAggregateOriginal('image', 1, expectedGeneration)
            : saveImageAggregateCopyFromDocument({
                targetAggregateId: 'copy',
                document: document('First'),
                previewBlob,
                thumbnailBlob,
                sourceGuard: {
                  aggregateId: 'image',
                  workspaceRevision: 1,
                  presentationRevision: 1,
                  sourceGeneration: expectedGeneration,
                },
              });
    if (!stale) {
      await pending;
      if (command === 'original')
        expect((await readStoredImageWorkspace('image'))?.history).toBeUndefined();
      if (command === 'copy') expect((await readStoredImageWorkspace('copy'))?.revision).toBe(1);
      if (command === 'presentation')
        expect(await database().get('aggregate_presentations', ['image', 'image'])).toMatchObject({
          previewBlob: { size: previewBlob.size },
        });
      if (command === 'promotion')
        expect(await database().get('media_library', 'image')).toMatchObject({
          lifecycle: { storageClass: 'library' },
        });
      return;
    }
    await expect(pending).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
    expect(
      await Promise.all(
        ['media_library', 'image_workspaces', 'aggregate_presentations', 'asset_owners'].map(
          (store) => database().getAll(store)
        )
      )
    ).toEqual(before);
  }
);

it('keeps working-copy history readable after deleting the source and saving the copy again', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const stored = (await readStoredImageWorkspace('image'))!;
  const source = (await readImageWorkspace('image'))!;
  const checkpoint = source.history;
  if (!checkpoint) throw new Error('Expected source history');
  try {
    const copy = await saveImageAggregateCopyFromDocument({
      targetAggregateId: 'copy',
      document: source.document,
      history: checkpoint,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    });
    const initialCopy = await readImageWorkspace(copy.aggregateId);
    try {
      expect(initialCopy?.history).toEqual(checkpoint);
    } finally {
      initialCopy?.releaseDocumentAssets?.();
    }
    const bindings = imageWorkspaceAssetBindings(stored);
    const tx = database().transaction(
      [
        'media_library',
        'image_workspaces',
        'image_workspace_identities',
        'asset_refs',
        'asset_owners',
      ],
      'readwrite'
    );
    await retireImageWorkspaceIdentity(tx, 'image');
    for (const { role } of bindings)
      await tx.objectStore('asset_owners').delete(['image-workspace', 'image', role]);
    const deleted: string[] = [];
    for (const assetId of new Set(bindings.map((asset) => asset.assetId))) {
      if ((await tx.objectStore('asset_owners').index('assetId').count(assetId)) === 0) {
        await tx.objectStore('asset_refs').delete(assetId);
        deleted.push(assetId);
      }
    }
    await tx.objectStore('media_library').delete('image');
    await tx.objectStore('image_workspaces').delete('image');
    await tx.done;
    for (const assetId of deleted) io.files.delete(assetId);
    await commitImageWorkspace({
      aggregateId: copy.aggregateId,
      document: source.document,
      history: checkpoint,
      expectedRevision: copy.revision,
      expectedGeneration: copy.sourceGeneration ?? null,
      reusableAssetsByRuntimeUrl: copy.documentAssetsByRuntimeUrl,
      reusableAssetsByVectorDefinitionId: copy.documentAssetsByVectorDefinitionId,
      ...(copy.historyAssetsByValue
        ? { reusableHistoryAssetsByValue: copy.historyAssetsByValue }
        : {}),
      requireExistingRoot: true,
    });
    const reopened = await readImageWorkspace('copy');
    try {
      expect(reopened?.revision).toBe(2);
      expect(reopened?.history).toEqual(source.history);
      expect(reopened?.sourceGeneration).toBe(copy.sourceGeneration);
    } finally {
      reopened?.releaseDocumentAssets?.();
    }
  } finally {
    source.releaseDocumentAssets?.();
  }
});

it('copies the current Image without reading or expanding retained history payloads', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  await commitImagePresentation({
    aggregateId: 'image',
    expectedWorkspaceRevision: 1,
    previewBlob: new Blob(['preview'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
  });
  const retained = (await readStoredImageWorkspace('image'))!.history;
  io.read.mockClear();
  io.read.mockImplementation(async (ref: AssetRef, name: string) => {
    if (ref.mimeType === 'application/json')
      throw new Error('Copy must not read retained history.');
    const blob = io.files.get(ref.assetId);
    if (!blob) throw new Error('Missing file');
    return new File([blob], name, { type: blob.type });
  });
  await expect(
    copyImageAggregate({
      aggregateId: 'image',
      expectedWorkspaceRevision: 1,
      targetAggregateId: 'copy',
    })
  ).resolves.toBe('copy');
  expect(io.read.mock.calls.some(([ref]) => ref.mimeType === 'application/json')).toBe(false);
  expect((await readStoredImageWorkspace('image'))!.history).toEqual(retained);
  expect((await readStoredImageWorkspace('copy'))?.history).toBeUndefined();
});

it('uses the configured sync checkpoint interval instead of freezing history on every native autosave', async () => {
  await database().put('sync_capture', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 100,
    enabled: true,
    spaceId: 'history-space',
    connectionGeneration: 1,
    checkpointIntervalMs: 300_000,
  });
  const checkpoint = history();
  let saved = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: checkpoint,
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  expect(saved.checkpointReceipt).toBeUndefined();
  for (const [index, cursor] of [2, 1].entries()) {
    saved = await commitImageWorkspace({
      aggregateId: 'image',
      document: document(cursor === 2 ? 'Second' : 'First'),
      history: { ...checkpoint, cursor },
      expectedRevision: index + 1,
      requireExistingRoot: true,
      expectedGeneration: saved.sourceGeneration ?? null,
      reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
      reusableHistoryAssetsByValue: saved.historyAssetsByValue!,
    });
  }
  const records: unknown[] = await database().getAll('sync_capture');
  const parsed = records.map(parseSyncCaptureRecord);
  expect(parsed.every((record) => record !== null)).toBe(true);
  expect(parsed.filter((record) => record?.kind === 'sync-operation')).toHaveLength(1);
  const pending = parsed.filter((record) => record?.kind === 'pending-checkpoint');
  expect(pending).toHaveLength(1);
  expect(saved.checkpointReceipt).toMatchObject({
    rootKind: 'media',
    rootId: 'image',
    revision: pending[0]!.revision,
  });
  expect((await readStoredImageWorkspace('image'))?.history?.cursor).toBe(1);
});

it('resumes a coalesced sync save without another pending identity or frozen history graph', async () => {
  await database().put('sync_capture', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 100,
    enabled: true,
    spaceId: 'history-space',
    connectionGeneration: 1,
    checkpointIntervalMs: 300_000,
  });
  const checkpoint = history();
  const first = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: checkpoint,
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const commit = createImageWorkspaceCommit({
    aggregateId: 'image',
    document: document('Second'),
    history: { ...checkpoint, cursor: 2 },
    expectedRevision: 1,
    requireExistingRoot: true,
    expectedGeneration: first.sourceGeneration ?? null,
    reusableAssetsByRuntimeUrl: first.documentAssetsByRuntimeUrl,
    reusableHistoryAssetsByValue: first.historyAssetsByValue!,
  });
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const records: unknown[] = await database().getAll('sync_capture');
  const pending = records
    .map(parseSyncCaptureRecord)
    .find((record) => record?.kind === 'pending-checkpoint');
  expect(pending).toBeDefined();
  const writes = io.write.mock.calls.length;
  expect((await commit()).revision).toBe(2);
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect(await database().getAll('sync_capture')).toEqual(records);
});

it('resumes a whole save after a lost acknowledgement with the same journal and no new bytes or revision', async () => {
  const commit = createImageWorkspaceCommit({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  expect(io.write).not.toHaveBeenCalled();
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const writes = io.write.mock.calls.length;
  const journalIds = [...io.journals.keys()];
  expect(journalIds).toHaveLength(1);
  const resumed = commit();
  expect(commit()).toBe(resumed);
  const result = await resumed;
  expect(result.revision).toBe(1);
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect(io.journals.size).toBe(0);
  expect((await readStoredImageWorkspace('image'))?.revision).toBe(1);
  expect(await commit()).toBe(result);
});

it('shares parallel calls to one lazy save instead of staging duplicate history', async () => {
  const ready = gate(),
    resume = gate();
  io.beforePublish = async () => {
    ready.release();
    await resume.promise;
  };
  const commit = createImageWorkspaceCommit({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const first = commit();
  await ready.promise;
  expect(commit()).toBe(first);
  const writes = io.write.mock.calls.length;
  resume.release();
  expect((await first).revision).toBe(1);
  expect(io.write).toHaveBeenCalledTimes(writes);
});

it('does not resume an old save into a recreated lifetime at the same native revision', async () => {
  const commit = createImageWorkspaceCommit({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const stored = (await readStoredImageWorkspace('image'))!;
  const root = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  const tx = database().transaction(
    ['media_library', 'image_workspaces', 'image_workspace_identities'],
    'readwrite'
  );
  await retireImageWorkspaceIdentity(tx, 'image');
  await tx.objectStore('media_library').delete('image');
  await tx.objectStore('image_workspaces').delete('image');
  await restoreImageWorkspaceIdentity(tx, 'image');
  const { publicationId: _receipt, ...restored } = stored;
  await tx.objectStore('media_library').put({ ...root, filename: 'Restored.png' });
  await tx.objectStore('image_workspaces').put(restored);
  await tx.done;
  const writes = io.write.mock.calls.length;
  await expect(commit()).rejects.toThrow();
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect(await readStoredImageWorkspace('image')).toEqual(restored);
});

it('replays the same accepted history journal without duplicate objects or another revision', async () => {
  io.loseAck = true;
  const checkpoint = history();
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('First'),
      history: checkpoint,
      expectedRevision: 0,
      requireExistingRoot: true,
    })
  ).rejects.toThrow('Lost acknowledgement');
  const journal = [...io.journals.values()][0]!;
  const writes = io.write.mock.calls.length;
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect((await readStoredImageWorkspace('image'))?.revision).toBe(1);
  expect((await readImageWorkspace('image'))?.history).toEqual(checkpoint);
});

it('does not mistake a different history cursor with identical content for an accepted replay', async () => {
  io.loseAck = true;
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('First'),
      history: history(),
      expectedRevision: 0,
      requireExistingRoot: true,
    })
  ).rejects.toThrow('Lost acknowledgement');
  const journal = [...io.journals.values()][0]!;
  const stored = (await readStoredImageWorkspace('image'))!;
  await database().put('image_workspaces', {
    ...stored,
    history: { ...stored.history, cursor: 0 },
  });
  await imageWorkspacePublicationAdapter.publish(journal);
  expect((await readStoredImageWorkspace('image'))?.history?.cursor).toBe(0);
});

it('does not compare every historical ref with every binding during publication', async () => {
  let reads = 0;
  let refCount = 0;
  io.beforePublish = async (journal) => {
    if (!isPlainRecord(journal.payload) || !Array.isArray(journal.payload['refs']))
      throw new Error('Missing publication refs');
    refCount = journal.payload['refs'].length;
    for (const ref of journal.payload['refs']) {
      if (!isPlainRecord(ref) || typeof ref['assetId'] !== 'string') throw new Error('Invalid ref');
      const id = ref['assetId'];
      Object.defineProperty(ref, 'assetId', {
        enumerable: true,
        configurable: true,
        get() {
          reads++;
          return id;
        },
      });
    }
  };
  const names = Array.from({ length: 101 }, (_, index) => `Project ${index}`);
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document(names[50]!),
    history: history(names, 50),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  expect(refCount).toBeGreaterThan(100);
  expect(reads).toBeGreaterThan(refCount);
  expect(reads).toBeLessThan(refCount * 20);
});

it.each([0, 1])(
  'refuses a delayed history publication after deletion and recreation at native revision %s',
  async (revision) => {
    let saved: Awaited<ReturnType<typeof commitImageWorkspace>> | undefined;
    if (revision)
      saved = await commitImageWorkspace({
        aggregateId: 'image',
        document: document('First'),
        history: history(),
        expectedRevision: 0,
        requireExistingRoot: true,
      });
    const ready = gate(),
      resume = gate();
    io.beforePublish = async () => {
      ready.release();
      await resume.promise;
    };
    const delayed = commitImageWorkspace({
      aggregateId: 'image',
      document: document('Delayed old session'),
      history: history(['Original', 'Delayed old session'], 1),
      expectedRevision: revision,
      requireExistingRoot: true,
      ...(saved ? { reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl } : {}),
      ...(saved?.historyAssetsByValue
        ? { reusableHistoryAssetsByValue: saved.historyAssetsByValue }
        : {}),
    });
    await ready.promise;
    const root = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
    const stored = await readStoredImageWorkspace('image');
    const rawRefs: unknown[] = await database().getAll('asset_refs');
    const refs = rawRefs.map(parseAssetRef).filter((ref) => ref !== null);
    const tx = database().transaction(
      [
        'media_library',
        'image_workspaces',
        'image_workspace_identities',
        'asset_refs',
        'asset_owners',
      ],
      'readwrite'
    );
    await retireImageWorkspaceIdentity(tx, 'image');
    await tx.objectStore('media_library').delete('image');
    await tx.objectStore('image_workspaces').delete('image');
    await restoreImageWorkspaceIdentity(tx, 'image');
    const blob = new Blob(['restored original'], { type: 'image/png' });
    await tx
      .objectStore('media_library')
      .put({ ...root, blob, size: blob.size, filename: 'Restored image.png' });
    if (stored)
      await putImageWorkspaceBackupRestore({
        entry: { ...stored, document: { ...stored.document, displayName: 'Restored project' } },
        ownerStore: tx.objectStore('asset_owners'),
        refStore: tx.objectStore('asset_refs'),
        refsByAssetId: new Map(refs.map((ref) => [ref.assetId, ref])),
        workspaceStore: tx.objectStore('image_workspaces'),
      });
    await tx.done;
    const refusal = expect(delayed).rejects.toThrow();
    resume.release();
    await refusal;
    expect((await readStoredImageWorkspace('image'))?.document.displayName).not.toBe(
      'Delayed old session'
    );
  }
);

it.each([true, false])(
  'refuses publication after the original-only root was deleted, existing=%s',
  async (requireExistingRoot) => {
    const ready = gate(),
      resume = gate();
    io.beforePublish = async () => {
      ready.release();
      await resume.promise;
    };
    const pending = commitImageWorkspace({
      aggregateId: 'image',
      document: document('Old session'),
      history: history(),
      expectedRevision: 0,
      requireExistingRoot,
    });
    await ready.promise;
    const tx = database().transaction(['media_library', 'image_workspace_identities'], 'readwrite');
    await retireImageWorkspaceIdentity(tx, 'image');
    await tx.objectStore('media_library').delete('image');
    await tx.done;
    const refusal = expect(pending).rejects.toThrow();
    resume.release();
    await refusal;
    expect(await database().get('media_library', 'image')).toBeUndefined();
    expect(await readStoredImageWorkspace('image')).toBeUndefined();
  }
);

it('preserves the current document and history when lifetime evidence is malformed', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const head = await readStoredImageWorkspace('image');
  const owners: unknown[] = await database().getAll('asset_owners');
  await database().put('image_workspace_identities', {
    version: 1,
    aggregateId: 'image',
    generation: '',
    retired: false,
  });
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('Second'),
      history: history(['Second'], 0),
      expectedRevision: 1,
      requireExistingRoot: true,
    })
  ).rejects.toThrow('lifetime evidence is invalid');
  expect(await readStoredImageWorkspace('image')).toEqual(head);
  expect(await database().getAll('asset_owners')).toEqual(owners);
});

it('replays its own first creation after a lost acknowledgement without issuing another lifetime', async () => {
  await database().delete('media_library', 'image');
  io.loseAck = true;
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('First'),
      history: history(),
      expectedRevision: 0,
      requireMissingRoot: true,
    })
  ).rejects.toThrow('Lost acknowledgement');
  const identity: unknown = await database().get('image_workspace_identities', 'image');
  expect(identity).toMatchObject({ retired: false, generation: expect.any(String) });
  const journal = [...io.journals.values()][0]!;
  const writes = io.write.mock.calls.length;
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(await database().get('image_workspace_identities', 'image')).toEqual(identity);
  expect((await readStoredImageWorkspace('image'))?.revision).toBe(1);
  expect(io.write).toHaveBeenCalledTimes(writes);
});

it('requires the generation returned by its first creation for the next save', async () => {
  await database().delete('media_library', 'image');
  const saved = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireMissingRoot: true,
  });
  expect(saved.sourceGeneration).toEqual(expect.any(String));
  const input = {
    aggregateId: 'image',
    document: document('Second'),
    history: history(['Original', 'Second'], 1),
    expectedRevision: 1,
    requireExistingRoot: true,
    reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
  };
  await expect(commitImageWorkspace(input)).rejects.toThrow();
  await expect(
    commitImageWorkspace({ ...input, expectedGeneration: saved.sourceGeneration! })
  ).resolves.toMatchObject({ revision: 2, sourceGeneration: saved.sourceGeneration });
});

it('defers ambiguous legacy creation recovery and retains its staged bytes', async () => {
  await database().delete('media_library', 'image');
  io.beforePublish = async () => {
    throw new Error('Interrupted before publication');
  };
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('First'),
      history: history(),
      expectedRevision: 0,
    })
  ).rejects.toThrow('Interrupted before publication');
  const journal = [...io.journals.values()][0]!;
  if (!isPlainRecord(journal.payload)) throw new Error('Missing payload');
  const { expectedGeneration: omitted, ...legacyPayload } = journal.payload;
  expect(omitted).toBeNull();
  const files = new Map(io.files);
  await expect(
    imageWorkspacePublicationAdapter.publish({ ...journal, payload: legacyPayload })
  ).resolves.toBe('defer');
  expect(io.files).toEqual(files);
  expect(await database().get('media_library', 'image')).toBeUndefined();
});

it.each(['screenshot', 'stored-asset'] as const)(
  'observes the original lifetime without reading %s bytes',
  async (kind) => {
    const root = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
    const { blob: _blob, ...metadata } = root;
    const { ref } = await io.write(new Blob(['original'], { type: 'image/png' }));
    const tx = database().transaction(
      ['media_library', 'image_workspace_identities', 'asset_refs'],
      'readwrite'
    );
    if (kind === 'stored-asset') {
      await tx
        .objectStore('media_library')
        .put({ ...metadata, source: { kind, assetId: ref.assetId } });
      await tx.objectStore('asset_refs').put(ref);
    }
    const generation = await restoreImageWorkspaceIdentity(tx, 'image');
    await tx.done;
    io.read.mockRejectedValue(new Error('Unexpected original byte read'));
    const observed = await readImageOriginalSource('image', { includeBlob: false });
    expect(observed.asset).toMatchObject({ id: 'image', workspaceRevision: 0, source: { kind } });
    expect(observed.sourceGeneration).toBe(generation);
    expect(observed.blob).toBeUndefined();
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('keeps the observed original bytes and lifetime together across restore during file IO', async () => {
  const root = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  const oldBlob = new Blob(['old-original'], { type: 'image/png' });
  const { ref: oldRef } = await io.write(oldBlob);
  const { blob: omittedBlob, ...metadata } = root;
  expect(omittedBlob).toBeInstanceOf(Blob);
  const oldRoot = {
    ...metadata,
    source: { kind: 'stored-asset', assetId: oldRef.assetId },
    size: oldBlob.size,
  };
  const setup = database().transaction(
    ['media_library', 'image_workspace_identities', 'asset_refs'],
    'readwrite'
  );
  await setup.objectStore('media_library').put(oldRoot);
  await setup.objectStore('asset_refs').put(oldRef);
  const oldGeneration = await restoreImageWorkspaceIdentity(setup, 'image');
  await setup.done;
  const entered = gate(),
    resume = gate();
  io.read.mockImplementationOnce(async (ref: AssetRef) => {
    entered.release();
    await resume.promise;
    return io.files.get(ref.assetId);
  });
  const opening = readImageOriginalSource('image');
  await entered.promise;
  const newBlob = new Blob(['new-original'], { type: 'image/png' });
  const { ref: newRef } = await io.write(newBlob);
  const restore = database().transaction(
    ['media_library', 'image_workspace_identities', 'asset_refs'],
    'readwrite'
  );
  await restore.objectStore('media_library').put({
    ...oldRoot,
    source: { kind: 'stored-asset', assetId: newRef.assetId },
    size: newBlob.size,
  });
  await restore.objectStore('asset_refs').put(newRef);
  const newGeneration = await restoreImageWorkspaceIdentity(restore, 'image');
  await restore.done;
  resume.release();
  const observed = await opening;
  expect(observed.sourceGeneration).toBe(oldGeneration);
  expect(await observed.blob?.text()).toBe('old-original');
  expect(observed.asset?.source).toEqual(oldRoot.source);
  const reopened = await readImageOriginalSource('image');
  expect(reopened.sourceGeneration).toBe(newGeneration);
  expect(await reopened.blob?.text()).toBe('new-original');
  await expect(
    commitImageWorkspace({
      aggregateId: 'image',
      document: document('Old session'),
      expectedRevision: 0,
      expectedGeneration: observed.sourceGeneration,
      requireExistingRoot: true,
    })
  ).rejects.toThrow();
});

it('reopens native history with its cursor, future snapshots and shared resource references', async () => {
  const checkpoint = history();
  const first = document('First'),
    second = document('Second');
  await commitImageWorkspace({
    aggregateId: 'image',
    document: first,
    history: checkpoint,
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const reopened = (await readImageWorkspace('image'))!;
  expect(reopened.history).toEqual(checkpoint);
  expect(reopened.document).toEqual(first);
  io.write.mockClear();
  const result = await commitImageWorkspace({
    aggregateId: 'image',
    document: second,
    history: { ...checkpoint, cursor: 2 },
    expectedRevision: reopened.revision,
    expectedGeneration: reopened.sourceGeneration ?? null,
    requireExistingRoot: true,
    reusableAssetsByRuntimeUrl: reopened.documentAssetsByRuntimeUrl!,
    reusableHistoryAssetsByValue: reopened.historyAssetsByValue!,
  });
  expect(result.revision).toBe(2);
  expect(io.write).not.toHaveBeenCalled();
  const final = (await readImageWorkspace('image'))!;
  expect(final.history).toEqual({ ...checkpoint, cursor: 2 });
  expect(final.document).toEqual(second);
  reopened.releaseDocumentAssets?.();
  final.releaseDocumentAssets?.();
});
