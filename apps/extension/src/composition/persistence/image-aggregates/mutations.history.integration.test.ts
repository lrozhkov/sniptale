import {
  REFERENCE_INDEX_STORES,
  ROW_REFERENCE_FIELD,
} from '../infrastructure/indexed-db/row-index-contract';
import { legacyImageProjectId } from '../media-library/legacy-projects';
import { installLegacyLibraryProjectMigration } from '../infrastructure/indexed-db/legacy-library-projects-migration';
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
  deleteImageWorkspaceProject,
} from './mutations';
import { readImageAggregateOriginalDocument } from './original-document';
import {
  readImageOriginalSource,
  readImageWorkspace,
  readStoredImageWorkspace,
} from '../image-workspaces/read';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { listCollectableProjectOriginalIds } from '../media-library/index.library';
import { putImageWorkspaceBackupRestore } from '../image-workspaces/backup-restore';
import { parseAssetRef } from '../assets/guards';
import { imageWorkspaceAssetBindings } from '../image-workspaces/assets';
import { captureRootCheckpointInTransaction } from '../sync-capture/capture';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { SCENARIO_CAPTURE_STORES } from '../sync-capture/scenario-snapshot';
import { moveStoredItemsToTrash, restoreStoredItemsFromTrash } from '../library-lifecycle/trash';

const io = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  sequence: 0,
  legacyFileFixture: false,
  files: new Map<string, Blob>(),
  journals: new Map<string, AssetReadyJournal>(),
  beforePublish: null as ((journal: AssetReadyJournal) => Promise<void>) | null,
  loseAck: false,
  completePhysicalDelete: vi.fn(async () => undefined),
  write: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../image-workspaces/history-codec', async (original) => {
  const module = await original<typeof import('../image-workspaces/history-codec')>();
  return {
    ...module,
    preparePersistedImageHistory: (
      checkpoint: Parameters<typeof module.preparePersistedImageHistory>[0],
      options: Parameters<typeof module.preparePersistedImageHistory>[1]
    ) =>
      module.preparePersistedImageHistory(checkpoint, {
        ...options,
        formatVersion: io.legacyFileFixture ? 1 : 2,
      }),
  };
});

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
    completePhysicalDeleteOperation: io.completePhysicalDelete,
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
  cursor = 1,
  createDocument = document
): EditorImageHistoryCheckpoint {
  const values: EditorImageHistoryValue[] = [];
  const ids = new Map<string, string>();
  const snapshots = names.map((name) =>
    encodeEditorImageHistorySnapshot(
      createDocument(name),
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
  io.legacyFileFixture = false;
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
      for (const name of [
        ...SCENARIO_CAPTURE_STORES,
        'recording_telemetry',
        'web_snapshots',
        'video_workspace_drafts',
        'thumbnails',
        'video_workspaces',
        'video_workspace_history',
        'video_projects',
        'video_review_identities',
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, name === 'video_review_identities' ? { keyPath: 'key' } : {});
        }
      }
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
  expect(stored?.history?.version).toBe(2);
  expect(io.write.mock.calls.filter(([blob]) => blob.type === 'application/json')).toHaveLength(1);
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

it('refuses an old image acknowledgement after ordinary Trash restore without losing accepted bytes', async () => {
  const commit = createImageWorkspaceCommit({
    aggregateId: 'image',
    document: document('First'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const journal = [...io.journals.values()][0]!;
  const source = [{ kind: 'media', id: 'image' }] as const;
  await moveStoredItemsToTrash(source, 10);
  await restoreStoredItemsFromTrash(source, 20);
  const restored = (await readStoredImageWorkspace('image'))!;

  await expect(commit()).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(await readStoredImageWorkspace('image')).toEqual(restored);
  expect(restored.revision).toBe(1);
  expect(journal.assetRefs.every((ref) => io.files.has(ref.assetId))).toBe(true);
  expect(io.journals.has(journal.journalId)).toBe(false);
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
  const withBitmap = (name: string) => ({
    ...document(name),
    sourceImageData: 'data:image/png;base64,' + btoa('Bitmap '.repeat(1000) + name),
  });
  await commitImageWorkspace({
    aggregateId: 'image',
    document: withBitmap(names[50]!),
    history: history(names, 50, withBitmap),
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

it('retains one original and two project links after replaying a lost acknowledgement', async () => {
  const original = { mediaId: 'image', generation: null };
  await commitImageWorkspace({
    aggregateId: 'first-project',
    original,
    document: document('First project'),
    history: history(),
    expectedRevision: 0,
  });
  io.loseAck = true;
  await expect(
    commitImageWorkspace({
      aggregateId: 'second-project',
      original,
      document: document('Second project'),
      history: history(),
      expectedRevision: 0,
    })
  ).rejects.toThrow('Lost acknowledgement');
  const identity: unknown = await database().get('image_workspace_identities', 'second-project');
  const journal = [...io.journals.values()][0]!;
  const writes = io.write.mock.calls.length;
  await imageWorkspacePublicationAdapter.publish(journal);

  expect(await database().get('image_workspace_identities', 'second-project')).toEqual(identity);
  expect(await database().getAllKeys('media_library')).toEqual(['image']);
  expect(
    await database().countFromIndex('image_workspaces', ROW_REFERENCE_INDEX, 'media:image')
  ).toBe(2);
  expect((await readImageOriginalSource('first-project')).blob).toBeDefined();
  expect((await readStoredImageWorkspace('first-project'))?.document.displayName).toBe(
    'First project'
  );
  expect((await readStoredImageWorkspace('second-project'))?.document.displayName).toBe(
    'Second project'
  );
  expect(io.write).toHaveBeenCalledTimes(writes);
});

it('shares the original byte object between simultaneous first image projects', async () => {
  const originalRow = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  const bytes = Uint8Array.from(atob(source.split(',')[1]!), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  await database().put('media_library', { ...originalRow, blob, size: blob.size });
  const original = { mediaId: 'image', generation: null };
  const save = (id: string) =>
    commitImageWorkspace({
      aggregateId: id,
      original,
      document: document(id),
      expectedRevision: 0,
    });
  await Promise.all([save('first-project'), save('second-project')]);

  const media = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  expect(media.blob).toBeUndefined();
  expect(media.source.kind).toBe('stored-asset');
  const first = (await readStoredImageWorkspace('first-project'))!;
  const second = (await readStoredImageWorkspace('second-project'))!;
  const assetId = first.document.sourceImage.assetId;
  expect(media.source).toEqual({ kind: 'stored-asset', assetId });
  expect(second.document.sourceImage.assetId).toBe(assetId);
  expect(io.write).toHaveBeenCalledOnce();
  expect(await database().get('asset_owners', ['media-library', 'image', 'source'])).toMatchObject({
    assetId,
  });
  await deleteImageWorkspaceProject(first.aggregateId, first.revision, first.lifecycle!.updatedAt);
  expect(await database().get('asset_refs', assetId)).toBeDefined();
  expect((await readImageOriginalSource(second.aggregateId)).blob?.size).toBe(blob.size);
  expect((await readImageAggregateOriginalDocument(second.aggregateId))?.canvasWidth).toBe(20);
  await restoreImageAggregateOriginal(
    second.aggregateId,
    second.revision,
    (await readImageOriginalSource(second.aggregateId)).sourceGeneration
  );
  expect((await readStoredImageWorkspace(second.aggregateId))?.document.sourceImage.assetId).toBe(
    assetId
  );
  expect(io.write).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'clears a superseded shared-source journal after purge (independently saved: %s)',
  async (savedIndependently) => {
    const media = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
    const bytes = Uint8Array.from(atob(source.split(',')[1]!), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    await database().put('media_library', {
      ...media,
      blob,
      size: blob.size,
      lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
    });
    const aggregateId = 'purged-project';
    io.loseAck = true;
    await expect(
      commitImageWorkspace({
        aggregateId,
        original: { mediaId: 'image', generation: null },
        document: document('First project'),
        expectedRevision: 0,
      })
    ).rejects.toThrow('Lost acknowledgement');
    const journal = [...io.journals.values()][0]!;
    const accepted = (await readStoredImageWorkspace(aggregateId))!;
    const assetId = accepted.document.sourceImage.assetId;
    const original = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
    expect(original.source).toEqual({ kind: 'stored-asset', assetId });
    expect(original.savedIndependently).toBe(false);
    if (savedIndependently) {
      await database().put('media_library', { ...original, savedIndependently: true });
    }
    await deleteImageWorkspaceProject(
      aggregateId,
      accepted.revision,
      accepted.lifecycle!.updatedAt
    );
    expect(await readStoredImageWorkspace(aggregateId)).toBeUndefined();
    expect(await database().get('asset_refs', assetId)).toBeDefined();
    await imageWorkspacePublicationAdapter.publish(journal);
    expect(io.journals.has(journal.journalId)).toBe(false);
    expect(await readStoredImageWorkspace(aggregateId)).toBeUndefined();
    expect(
      await database().get('asset_owners', ['media-library', 'image', 'source'])
    ).toMatchObject({
      assetId,
    });
    expect(await (await readImageOriginalSource('image')).blob?.arrayBuffer()).toEqual(
      await blob.arrayBuffer()
    );
    await expect(listCollectableProjectOriginalIds(new AbortController().signal)).resolves.toEqual(
      savedIndependently ? [] : ['image']
    );
  }
);

it('starts a linked project from intact original bytes without reading a missing legacy work ref', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('Legacy edit'),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const legacy = (await readStoredImageWorkspace('image'))!;
  await database().delete('asset_refs', legacy.document.sourceImage.assetId);
  const original = await readImageOriginalSource('image');
  await expect(
    commitImageWorkspace({
      aggregateId: 'new-project',
      original: { mediaId: 'image', generation: original.sourceGeneration },
      document: document('New edit'),
      expectedRevision: 0,
    })
  ).resolves.toMatchObject({ revision: 1 });
  expect((await readStoredImageWorkspace('new-project'))?.sourceMediaId).toBe('image');
  expect(await readStoredImageWorkspace('image')).toEqual(legacy);
});

it('explicitly saves an independent image project without saving its original separately', async () => {
  const original = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  await database().put('media_library', {
    ...original,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  const aggregateId = 'independent-project';
  const saved = await commitImageWorkspace({
    aggregateId,
    original: { mediaId: 'image', generation: null },
    document: document('New work'),
    expectedRevision: 0,
  });
  const expectedGeneration = saved.sourceGeneration!;
  const previewBlob = new Blob(['preview']);
  await commitImagePresentation({
    aggregateId,
    expectedGeneration,
    expectedWorkspaceRevision: 1,
    previewBlob,
    thumbnailBlob: previewBlob,
  });
  await expect(promoteImageAggregate(aggregateId, 0, expectedGeneration)).rejects.toMatchObject({
    name: 'StaleImageWorkspaceError',
  });
  await promoteImageAggregate(aggregateId, 1, expectedGeneration);
  await promoteImageAggregate(aggregateId, 1, expectedGeneration);
  expect(await database().getAllKeys('media_library')).toEqual(['image']);
  expect(await database().get('media_library', 'image')).toMatchObject({
    savedIndependently: false,
  });
  expect((await readStoredImageWorkspace(aggregateId))?.revision).toBe(1);
});

it('captures two independent images against one original when WebDAV activates before publication', async () => {
  const media = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  await database().put('media_library', {
    ...media,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    spaceId: 'space',
    createdAt: 10,
    connectionGeneration: 1,
  };
  io.beforePublish = async () => {
    await database().put('sync_capture', profile);
  };
  for (const id of ['first-project', 'second-project']) {
    await expect(
      commitImageWorkspace({
        aggregateId: id,
        original: { mediaId: 'image', generation: null },
        document: document(id),
        expectedRevision: 0,
      })
    ).resolves.toMatchObject({ revision: 1 });
    io.beforePublish = null;
  }

  const before: unknown[] = await database().getAll('sync_capture');
  const pending = before
    .map(parseSyncCaptureRecord)
    .filter((record) => record?.kind === 'pending-checkpoint');
  expect(pending).toHaveLength(2);
  for (const checkpoint of pending) {
    const tx = database().transaction(Array.from(database().objectStoreNames), 'readwrite');
    await expect(
      captureRootCheckpointInTransaction(tx, checkpoint, { force: true })
    ).resolves.toMatchObject({ rootKind: 'image-project', rootId: checkpoint.rootId });
    await tx.done;
  }
  const raw: unknown[] = await database().getAll('sync_capture');
  const captures = raw
    .map(parseSyncCaptureRecord)
    .filter((record) => record?.kind === 'sync-operation' && record.phase === 'native');
  const originals = captures.filter((item) => item.rootKind === 'media');
  const projects = captures.filter((item) => item.rootKind === 'image-project');
  expect(originals).toHaveLength(1);
  expect(originals[0]).toMatchObject({
    rootId: 'image',
    change: { kind: 'image', rows: { savedIndependently: false } },
  });
  expect(projects.map((item) => item.rootId).sort()).toEqual(['first-project', 'second-project']);
  for (const project of projects)
    expect(project.change).toMatchObject({
      kind: 'image',
      mediaDependencies: [{ mediaId: 'image', generation: 1, basis: [originals[0]!.operationId] }],
    });
  expect(await database().getAllKeys('media_library')).toEqual(['image']);
  expect(io.journals.size).toBe(0);
});

it('refuses document and presentation writes while an image project is in Trash', async () => {
  const aggregateId = 'independent-project';
  const saved = await commitImageWorkspace({
    aggregateId,
    original: { mediaId: 'image', generation: null },
    document: document('Before Trash'),
    expectedRevision: 0,
  });
  const project = (await readStoredImageWorkspace(aggregateId))!;
  const trashed = {
    ...project,
    lifecycle: { ...project.lifecycle!, trashedAt: Date.now(), updatedAt: Date.now() },
  };
  await database().put('image_workspaces', trashed);
  const expectedGeneration = saved.sourceGeneration!;
  await expect(readImageWorkspace(aggregateId)).rejects.toThrow('Image workspace is unavailable.');
  await expect(
    commitImageWorkspace({
      aggregateId,
      document: document('Delayed write'),
      expectedRevision: project.revision,
      expectedGeneration,
      requireExistingRoot: true,
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  const previewBlob = new Blob(['delayed preview']);
  await expect(
    commitImagePresentation({
      aggregateId,
      expectedWorkspaceRevision: project.revision,
      expectedGeneration,
      previewBlob,
      thumbnailBlob: previewBlob,
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(await readStoredImageWorkspace(aggregateId)).toEqual(trashed);
  expect(await database().getAllKeys('media_library')).toEqual(['image']);
  expect(
    await database().countFromIndex('image_workspaces', ROW_REFERENCE_INDEX, 'media:image')
  ).toBe(1);
});

it('purges only the selected image project and its presentation', async () => {
  const original = { mediaId: 'image', generation: null };
  const saveProject = async (aggregateId: string) => {
    const saved = await commitImageWorkspace({
      aggregateId,
      original,
      document: document(aggregateId),
      history: history(),
      expectedRevision: 0,
    });
    const sourceGeneration = saved.sourceGeneration!;
    const preview = new Blob([aggregateId]);
    await commitImagePresentation({
      aggregateId,
      expectedGeneration: sourceGeneration,
      expectedWorkspaceRevision: saved.revision,
      previewBlob: preview,
      thumbnailBlob: preview,
    });
    return { ...saved, aggregateId, sourceGeneration };
  };
  const [removed, retained] = await Promise.all([
    saveProject('removed-project'),
    saveProject('retained-project'),
  ]);
  const removedProject = (await readStoredImageWorkspace(removed.aggregateId))!;
  const originalRow: unknown = await database().get('media_library', 'image');
  await deleteImageWorkspaceProject(
    removed.aggregateId,
    removed.revision,
    removedProject.lifecycle!.updatedAt
  );
  expect(await database().get('media_library', 'image')).toEqual(originalRow);
  expect(await readStoredImageWorkspace(removed.aggregateId)).toBeUndefined();
  expect(
    await database().get('aggregate_presentations', ['image', removed.aggregateId])
  ).toBeUndefined();
  expect(
    await database().get('aggregate_presentations', ['image', retained.aggregateId])
  ).toBeDefined();
  expect((await readImageWorkspace(retained.aggregateId))?.history).toEqual(history());
  expect(
    await database().countFromIndex('image_workspaces', ROW_REFERENCE_INDEX, 'media:image')
  ).toBe(1);
  expect(
    (await database().getAll('asset_owners')).every(
      (owner: { ownerId: string }) => owner.ownerId !== removed.aggregateId
    )
  ).toBe(true);
  await expect(
    commitImageWorkspace({
      aggregateId: removed.aggregateId,
      expectedRevision: removed.revision,
      expectedGeneration: removed.sourceGeneration,
      document: document('Delayed autosave'),
      requireExistingRoot: true,
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
});

it('keeps the original discoverable for recovery after project bytes fail to delete', async () => {
  const aggregateId = 'last-project';
  const original = parseMediaLibraryEntry(await database().get('media_library', 'image'))!;
  await database().put('media_library', {
    ...original,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  const saved = await commitImageWorkspace({
    aggregateId,
    original: { mediaId: 'image', generation: null },
    document: document('Last work'),
    expectedRevision: 0,
  });
  const project = (await readStoredImageWorkspace(aggregateId))!;
  io.completePhysicalDelete.mockRejectedValueOnce(new Error('OPFS unavailable'));
  await expect(
    deleteImageWorkspaceProject(aggregateId, saved.revision, project.lifecycle!.updatedAt)
  ).resolves.toBe('image');
  expect(io.completePhysicalDelete).toHaveBeenCalledOnce();
  expect(await readStoredImageWorkspace(aggregateId)).toBeUndefined();
  expect(await database().getAllKeys('asset_operations')).toHaveLength(1);
  const unrelated = database().transaction('media_library', 'readwrite');
  await Promise.all(
    Array.from({ length: 64 }, (_, index) =>
      unrelated.store.put({ ...original, id: `earlier-${index}`, savedIndependently: true })
    )
  );
  await unrelated.done;
  await expect(listCollectableProjectOriginalIds(new AbortController().signal)).resolves.toEqual([
    'image',
  ]);
});

it.each(['unchanged', 'removed', 'trashed', 'restored', 'replaced'] as const)(
  'recovers a prepared image project after its original is %s',
  async (change) => {
    io.beforePublish = async () => {
      throw new Error('Interrupted before publication');
    };
    await expect(
      commitImageWorkspace({
        aggregateId: 'pending-project',
        original: { mediaId: 'image', generation: null },
        document: document('New work'),
        history: history(),
        expectedRevision: 0,
      })
    ).rejects.toThrow('Interrupted before publication');
    const journal = [...io.journals.values()][0]!;
    if (change === 'restored') {
      const source = [{ kind: 'media', id: 'image' }] as const;
      await moveStoredItemsToTrash(source, 10);
      await restoreStoredItemsFromTrash(source, 20);
      await imageWorkspacePublicationAdapter.publish(journal);
      expect(await readStoredImageWorkspace('pending-project')).toBeUndefined();
      expect(io.journals.has(journal.journalId)).toBe(false);
      expect(journal.assetRefs.every((ref) => !io.files.has(ref.assetId))).toBe(true);
      const restored = await readImageOriginalSource('image');
      expect(restored?.sourceGeneration).toEqual(expect.any(String));
      io.beforePublish = null;
      await expect(
        commitImageWorkspace({
          aggregateId: 'fresh-project',
          original: { mediaId: 'image', generation: restored!.sourceGeneration! },
          document: document('Fresh work'),
          expectedRevision: 0,
        })
      ).resolves.toMatchObject({ revision: 1 });
      return;
    }
    const tx = database().transaction(['media_library', 'image_workspace_identities'], 'readwrite');
    const mediaStore = tx.objectStore('media_library');
    const original = parseMediaLibraryEntry(await mediaStore.get('image'))!;
    if (change === 'trashed') {
      await mediaStore.put({
        ...original,
        lifecycle: { ...original.lifecycle!, trashedAt: 5 },
      });
    } else if (change !== 'unchanged') {
      await retireImageWorkspaceIdentity(tx, 'image');
      await mediaStore.delete('image');
      if (change === 'replaced') {
        await restoreImageWorkspaceIdentity(tx, 'image');
        await mediaStore.put(original);
      }
    }
    await tx.done;

    await expect(imageWorkspacePublicationAdapter.publish(journal)).resolves.toBeUndefined();
    if (change === 'unchanged') {
      expect((await readStoredImageWorkspace('pending-project'))?.sourceMediaId).toBe('image');
      return;
    }
    expect(io.journals.has(journal.journalId)).toBe(false);
    expect(journal.assetRefs.every((ref) => !io.files.has(ref.assetId))).toBe(true);
    expect(await readStoredImageWorkspace('pending-project')).toBeUndefined();
    expect(await database().get('image_workspace_identities', 'pending-project')).toBeUndefined();
  }
);

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

it('retires legacy JSON ownership atomically when the next save publishes one bundle', async () => {
  io.legacyFileFixture = true;
  const checkpoint = history();
  const saved = await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: checkpoint,
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  const legacy = (await readStoredImageWorkspace('image'))!.history!;
  expect(legacy.version).toBe(1);
  if (legacy.version !== 1) throw new Error('Expected file envelope.');
  const oldIds = legacy.snapshots.map((entry) => entry.assetId);
  expect(oldIds.length).toBeGreaterThan(1);
  const reopened = await readImageWorkspace('image');
  expect(reopened?.history).toEqual(checkpoint);
  reopened?.releaseDocumentAssets?.();
  io.legacyFileFixture = false;
  io.read.mockClear();
  io.write.mockClear();
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('First'),
    history: checkpoint,
    expectedRevision: 1,
    requireExistingRoot: true,
    reusableAssetsByRuntimeUrl: saved.documentAssetsByRuntimeUrl,
    reusableHistoryAssetsByValue: saved.historyAssetsByValue!,
  });
  const current = (await readStoredImageWorkspace('image'))!;
  expect(current.history?.version).toBe(2);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.write).toHaveBeenCalledTimes(1);
  expect(io.write.mock.calls[0]![0].type).toBe('application/json');
  const owners = await database().getAll('asset_owners');
  expect(owners.some((row) => oldIds.includes(row.assetId))).toBe(false);
  expect(imageWorkspaceAssetBindings(current).some((row) => oldIds.includes(row.assetId))).toBe(
    false
  );
  expect((await database().getAll('asset_operations')).length).toBeGreaterThan(0);
  expect((await readImageWorkspace('image'))?.history).toEqual(checkpoint);
});

async function upgradeLegacyImageFixture() {
  raw.close();
  raw = await openDB(databaseName, 2, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      for (const name of [...REFERENCE_INDEX_STORES, 'editor_vector_library']) {
        const store = db.objectStoreNames.contains(name)
          ? tx.objectStore(name)
          : db.createObjectStore(name);
        if (!store.indexNames.contains(ROW_REFERENCE_INDEX))
          store.createIndex(ROW_REFERENCE_INDEX, ROW_REFERENCE_FIELD, { multiEntry: true });
      }
      for (const name of ['recording_events', 'recording_cursor_trajectories']) {
        const store = db.objectStoreNames.contains(name)
          ? tx.objectStore(name)
          : db.createObjectStore(name);
        if (!store.indexNames.contains('snapshotAssetId'))
          store.createIndex('snapshotAssetId', 'snapshotAssetId');
      }
      installLegacyLibraryProjectMigration(tx);
    },
  });
  io.db = withIndexedRowProjections(raw);
}

it.each([
  'pending edit',
  'pending first edit',
  'committed edit',
  'committed new file',
  'pending edit with source trashed',
  'pending edit trashed before upgrade',
  'superseded edit',
  'discarded first open',
] as const)(
  'recovers a legacy Image %s through the native upgrade without rewriting the original',
  async (interruption) => {
    const firstIsEmpty = interruption === 'pending first edit';
    const discarded = interruption === 'discarded first open';
    const newFile = interruption === 'committed new file';
    const committed = interruption === 'committed edit' || newFile || discarded;
    if (newFile) await database().delete('media_library', 'image');
    if (!committed)
      await commitImageWorkspace({
        aggregateId: 'image',
        document: document(firstIsEmpty ? 'image.png' : 'Previous edit'),
        expectedRevision: 0,
        requireExistingRoot: true,
        ...(firstIsEmpty ? { imageContentState: 'original' } : {}),
      });
    if (committed) io.loseAck = true;
    else
      io.beforePublish = async () => {
        throw new Error('Interrupted before native publication');
      };
    await expect(
      commitImageWorkspace({
        aggregateId: 'image',
        document: document(discarded ? 'image.png' : 'Recovered edit'),
        expectedRevision: committed ? 0 : 1,
        ...(newFile ? { requireMissingRoot: true } : { requireExistingRoot: true }),
        ...(discarded ? { imageContentState: 'original' } : {}),
      })
    ).rejects.toThrow(/Lost acknowledgement|Interrupted/);
    const [journal] = io.journals.values();
    if (!journal) throw new Error('Ready journal was lost before upgrade.');
    const inheritedTrash = interruption === 'pending edit trashed before upgrade';
    if (inheritedTrash) await moveStoredItemsToTrash([{ kind: 'media', id: 'image' }], 10);
    const previous = parseMediaLibraryEntry(await database().get('media_library', 'image'));
    io.beforePublish = null;
    await upgradeLegacyImageFixture();
    const targetId = legacyImageProjectId('image');
    const superseded = interruption === 'superseded edit';
    if (superseded) {
      const tx = database().transaction('image_workspace_identities', 'readwrite');
      await restoreImageWorkspaceIdentity(tx, 'image');
      await tx.done;
    }
    const trashSource = interruption === 'pending edit with source trashed';
    if (trashSource) {
      const original = parseMediaLibraryEntry(await database().get('media_library', 'image'));
      if (!original) throw new Error('Migrated source was lost.');
      await moveStoredItemsToTrash([{ kind: 'media', id: original.id }], 10);
    }
    const before = await readStoredImageWorkspace(targetId);
    const beforeSource = parseMediaLibraryEntry(await database().get('media_library', 'image'));
    if (trashSource || inheritedTrash)
      expect(beforeSource?.lifecycle?.trashedAt).toEqual(expect.any(Number));
    const result = await imageWorkspacePublicationAdapter.publish(journal);
    expect(result).toBeUndefined();
    const after = await readStoredImageWorkspace(targetId);
    if (discarded || superseded) {
      expect(after).toEqual(before);
      for (const ref of journal.assetRefs) expect(io.files.has(ref.assetId)).toBe(discarded);
      expect(await readStoredImageWorkspace('image')).toBeUndefined();
      return;
    }
    expect(after).toMatchObject({
      aggregateId: targetId,
      sourceMediaId: 'image',
      publicationId: journal.journalId,
      revision: interruption === 'pending edit' || trashSource || inheritedTrash ? 2 : 1,
      document: { displayName: 'Recovered edit' },
    });
    const blobs = new Map(io.files);
    await imageWorkspacePublicationAdapter.publish(journal);
    expect(await readStoredImageWorkspace(targetId)).toEqual(after);
    expect(io.files).toEqual(blobs);
    for (const ref of journal.assetRefs) expect(io.files.has(ref.assetId)).toBe(true);
    expect(await readStoredImageWorkspace('image')).toBeUndefined();
    const original = parseMediaLibraryEntry(await database().get('media_library', 'image'));
    expect(original).toMatchObject({ imageContentState: 'original', workspaceRevision: 0 });
    expect(await original?.blob?.text()).toBe(await previous?.blob?.text());
    if (trashSource || inheritedTrash) expect(original?.lifecycle).toEqual(beforeSource?.lifecycle);
    if (inheritedTrash)
      expect(after?.lifecycle?.trashedAt).toBe(beforeSource?.lifecycle?.trashedAt);
  }
);

it('saves a Gallery copy of an inline original without an aggregate presentation', async () => {
  const original = await database().get('media_library', 'image');
  await database().put('media_library', { ...original, imageContentState: 'original' });

  await expect(
    copyImageAggregate({
      aggregateId: 'image',
      expectedWorkspaceRevision: 0,
      targetAggregateId: 'original-copy',
    })
  ).resolves.toBe('original-copy');

  const copy = await database().get('aggregate_presentations', ['image', 'original-copy']);
  expect(await copy?.previewBlob.text()).toBe('original');
  expect(await database().get('image_workspaces', 'image')).toBeUndefined();
  expect(await database().get('aggregate_presentations', ['image', 'image'])).toBeUndefined();
});

it.each(['pending', 'source replaced', 'lost acknowledgement'] as const)(
  'recovers a legacy Gallery copy after %s',
  async (state) => {
    const first = await commitImageWorkspace({
      aggregateId: 'image',
      document: document('Copy source'),
      expectedRevision: 0,
      requireExistingRoot: true,
    });
    await commitImagePresentation({
      aggregateId: 'image',
      expectedWorkspaceRevision: first.revision,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumbnail'], { type: 'image/png' }),
    });
    if (state === 'lost acknowledgement') io.loseAck = true;
    else
      io.beforePublish = async () => {
        throw new Error('Copy stopped after staging');
      };
    await expect(
      copyImageAggregate({
        aggregateId: 'image',
        expectedWorkspaceRevision: first.revision,
        targetAggregateId: 'copied',
      })
    ).rejects.toThrow(/Lost acknowledgement|Copy stopped after staging/);
    const [journal] = io.journals.values();
    if (!journal) throw new Error('Ready copy was lost.');
    io.beforePublish = null;
    await upgradeLegacyImageFixture();
    if (state === 'source replaced') {
      const target = legacyImageProjectId('image');
      const tx = database().transaction('image_workspace_identities', 'readwrite');
      await restoreImageWorkspaceIdentity(tx, target);
      await tx.done;
    }
    const result = await imageWorkspacePublicationAdapter.publish(journal);
    const copyId = state === 'lost acknowledgement' ? legacyImageProjectId('copied') : 'copied';
    const copy = await readStoredImageWorkspace(copyId);
    if (state === 'source replaced') {
      expect(result).toBe('defer');
      expect(copy).toBeUndefined();
    } else {
      expect(result).toBeUndefined();
      expect(copy).toMatchObject({ document: { displayName: 'Copy source' } });
    }
    for (const ref of journal.assetRefs) expect(io.files.has(ref.assetId)).toBe(true);
    expect(
      await commitImageWorkspace({
        aggregateId: 'unrelated',
        document: document('Unrelated save'),
        expectedRevision: 0,
      })
    ).toMatchObject({ revision: 1 });
  }
);

it('resets a damaged migrated Image workspace to its original without changing the original', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('Damaged edit'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  await upgradeLegacyImageFixture();
  const id = legacyImageProjectId('image');
  const stored = await readStoredImageWorkspace(id);
  if (!stored?.history?.snapshots[0]) throw new Error('Expected native history evidence.');
  io.files.delete(stored.history.snapshots[0].assetId);
  await expect(readImageWorkspace(id)).rejects.toThrow();
  const before = parseMediaLibraryEntry(await database().get('media_library', 'image'));
  expect(
    await restoreImageAggregateOriginal(id, stored.revision, undefined, 'image')
  ).toMatchObject({ revision: stored.revision + 1 });
  expect(await readImageWorkspace(id)).toMatchObject({
    sourceMediaId: 'image',
    revision: stored.revision + 1,
    document: { sourceName: 'image.png' },
  });
  expect((await readImageWorkspace(id))?.history).toBeUndefined();
  const after = parseMediaLibraryEntry(await database().get('media_library', 'image'));
  expect(after).toEqual(before);
  expect(await after?.blob?.text()).toBe(await before?.blob?.text());
});

it('refuses a delayed original reset when the same project revision enters a new lifetime', async () => {
  await commitImageWorkspace({
    aggregateId: 'image',
    document: document('Preserve this edit'),
    history: history(),
    expectedRevision: 0,
    requireExistingRoot: true,
  });
  await upgradeLegacyImageFixture();
  const id = legacyImageProjectId('image');
  const row = await readStoredImageWorkspace(id);
  const original = parseMediaLibraryEntry(await database().get('media_library', 'image'));
  if (!row?.lifecycle || !original?.blob) throw new Error('Missing migrated image fixture.');
  const assetId = 'original-for-delayed-reset';
  io.files.set(assetId, original.blob);
  await database().put('asset_refs', {
    assetId,
    mimeType: original.mimeType,
    size: original.size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/original-for-delayed-reset' },
  });
  await database().put('asset_owners', {
    assetId,
    ownerKind: 'media-library',
    ownerId: original.id,
    role: 'source',
  });
  const { blob: _inline, ...originalMetadata } = original;
  await database().put('media_library', {
    ...originalMetadata,
    source: { kind: 'stored-asset', assetId },
  });
  const observed = await readImageOriginalSource(id, { includeBlob: false });
  const entered = gate();
  const resume = gate();
  const readFile = io.read.getMockImplementation()!;
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    entered.release();
    await resume.promise;
    return readFile(ref, filename);
  });
  const pending = restoreImageAggregateOriginal(id, row.revision, undefined, original.id);
  const result = expect(pending).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  try {
    await entered.promise;
    await moveStoredItemsToTrash(
      [
        {
          kind: 'image-project',
          id,
          expectedRevision: row.revision,
          expectedLifecycleUpdatedAt: row.lifecycle.updatedAt,
        },
      ],
      10
    );
    const trashed = await readStoredImageWorkspace(id);
    if (!trashed?.lifecycle) throw new Error('Project was not moved to Trash.');
    await restoreStoredItemsFromTrash(
      [
        {
          kind: 'image-project',
          id,
          expectedRevision: trashed.revision,
          expectedLifecycleUpdatedAt: trashed.lifecycle.updatedAt,
        },
      ],
      20
    );
  } finally {
    resume.release();
  }
  await result;
  io.read.mockClear();
  await expect(
    restoreImageAggregateOriginal(id, row.revision, observed.sourceGeneration, original.id)
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(io.read).not.toHaveBeenCalled();
  expect(await readStoredImageWorkspace(id)).toMatchObject({
    revision: row.revision,
    document: row.document,
    history: row.history,
  });
});

it.each([false, true])(
  'publishes a local file with its exact hidden original, source changed=%s',
  async (changed) => {
    const sourceImageData = changed ? 'data:image/png;base64,Y2hhbmdlZA==' : source;
    const input = {
      aggregateId: 'local-project',
      newOriginal: {
        mediaId: 'local-original',
        filename: 'input.png',
        width: 20,
        height: 20,
        dataUrl: source,
      },
      document: { ...document('First edit'), sourceImageData },
      expectedRevision: 0,
      requireMissingRoot: true,
    };
    expect(await database().get('media_library', input.newOriginal.mediaId)).toBeUndefined();
    io.loseAck = true;
    const save = createImageWorkspaceCommit(input);
    await expect(save()).rejects.toThrow('Lost acknowledgement');
    const saved = await save();
    expect(saved.revision).toBe(1);
    const original = parseMediaLibraryEntry(
      await database().get('media_library', input.newOriginal.mediaId)
    );
    expect(original).toMatchObject({
      filename: 'input.png',
      originalFilename: 'input.png',
      savedIndependently: false,
      imageContentState: 'original',
      lifecycle: { storageClass: 'library' },
    });
    if (original?.source.kind !== 'stored-asset') throw new Error('Missing local file reference.');
    const expected = Uint8Array.from(atob(source.split(',')[1]!), (char) => char.charCodeAt(0));
    expect(await io.files.get(original.source.assetId)?.arrayBuffer()).toEqual(expected.buffer);
    const workspace = await readStoredImageWorkspace(input.aggregateId);
    expect(workspace).toMatchObject({ revision: 1, sourceMediaId: original.id });
    expect(workspace?.document.sourceImage.assetId === original.source.assetId).toBe(!changed);
    expect(io.write).toHaveBeenCalledTimes(changed ? 2 : 1);
    expect(
      await database().countFromIndex(
        'image_workspaces',
        ROW_REFERENCE_INDEX,
        'media:local-original'
      )
    ).toBe(1);
  }
);

it('rolls back local original and project ownership together after the first workspace put', async () => {
  const input = {
    aggregateId: 'local-project',
    newOriginal: {
      mediaId: 'local-original',
      filename: 'input.png',
      width: 20,
      height: 20,
      dataUrl: source,
    },
    document: document('First edit'),
    expectedRevision: 0,
    requireMissingRoot: true,
  };
  const save = createImageWorkspaceCommit(input);
  const put = IDBObjectStore.prototype.put;
  const abort = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey
  ) {
    const request = put.call(this, value, key);
    if (this.name === 'image_workspaces')
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  });
  try {
    await expect(save()).rejects.toMatchObject({ name: 'TransactionInactiveError' });
  } finally {
    abort.mockRestore();
  }
  expect(await database().get('media_library', 'local-original')).toBeUndefined();
  expect(await database().get('image_workspaces', 'local-project')).toBeUndefined();
  expect(await database().getAll('asset_owners')).toEqual([]);
  expect(await database().getAll('asset_refs')).toEqual([]);
  expect(await database().getAll('image_workspace_identities')).toEqual([]);
  expect(await save()).toMatchObject({ revision: 1 });
  expect(io.write).toHaveBeenCalledOnce();
});

it('preserves the existing original when delayed local publication collides', async () => {
  const input = {
    aggregateId: 'local-project',
    newOriginal: {
      mediaId: 'local-original',
      filename: 'input.png',
      width: 20,
      height: 20,
      dataUrl: source,
    },
    document: document('First edit'),
    expectedRevision: 0,
    requireMissingRoot: true,
  };
  const existing = await database().get('media_library', 'image');
  io.beforePublish = async () => {
    await database().put('media_library', { ...existing, id: input.newOriginal.mediaId });
  };
  await expect(commitImageWorkspace(input)).rejects.toMatchObject({
    name: 'ImageAggregateCollisionError',
    aggregateId: input.newOriginal.mediaId,
  });
  io.beforePublish = null;
  const [journal] = io.journals.values();
  if (!journal) throw new Error('The delayed publication journal is missing.');

  await expect(imageWorkspacePublicationAdapter.publish(journal)).resolves.toBeUndefined();
  expect(await database().get('image_workspaces', input.aggregateId)).toBeUndefined();
  const original = await readImageOriginalSource(input.newOriginal.mediaId);
  expect(await original.blob?.text()).toBe('original');
  for (const ref of journal.assetRefs) expect(io.files.has(ref.assetId)).toBe(false);
});
