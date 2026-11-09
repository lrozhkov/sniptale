import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { commitImagePresentation, commitImageWorkspace } from '../image-aggregates/mutations';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { captureRootCheckpointInTransaction, captureImageInTransaction } from './capture';
import { readCheckpointInTransaction } from './checkpoints';
import { parseSyncCaptureRecord } from './guards';
import { captureRootKey } from './contracts';
import { digestCapturedImageRows, freezeImageInTransaction } from './image-snapshot';

const io = vi.hoisted(() => ({ database: vi.fn(), prepare: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../document-assets', async (original) => ({
  ...(await original<typeof import('../document-assets')>()),
  preparePersistedEditorDocument: io.prepare,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  createAssetPublicationJournal: vi.fn(async (args) => ({
    ...args,
    journalId: crypto.randomUUID(),
  })),
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  releaseAssetReadyProtection: vi.fn(async () => undefined),
  readAssetFile: vi.fn(async () => new File(['original'], 'image.png', { type: 'image/png' })),
}));
vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: vi.fn(async () => new Blob(['thumbnail'])),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.unstubAllGlobals());

const scope = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
const root = { rootKind: 'media' as const, rootId: 'image' };
const stores = [
  'media_library',
  'image_workspaces',
  'aggregate_presentations',
  'asset_refs',
  'asset_owners',
  'asset_residency',
  'sync_capture',
  'sync_outbox',
];
async function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_capture');
  const table = (name: string) => fixture.rows.get(name)!;
  // This fixture stores presentation rows by aggregate ID; adapt the native compound-key reads.
  const key = (name: string, value: IDBValidKey) =>
    name === 'aggregate_presentations' && Array.isArray(value) && typeof value[1] === 'string'
      ? value[1]
      : value;
  io.database.mockResolvedValue({
    get: (name: string, value: IDBValidKey) => {
      const selected = key(name, value);
      return fixture.database.get(
        name,
        typeof selected === 'string' ? selected : JSON.stringify(selected)
      );
    },
    transaction: (names: string[], mode: string) => {
      const tx = fixture.database.transaction(names, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore: (name: string) => {
          const store = tx.objectStore(name);
          return { ...store, get: (value: IDBValidKey) => store.get(key(name, value)) };
        },
      };
    },
  });
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
    checkpointIntervalMs: 0,
  });
  table('media_library').set(
    root.rootId,
    createMediaLibraryEntry({
      id: root.rootId,
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      mimeType: 'image/png',
      size: 8,
      blob: new Blob(['original'], { type: 'image/png' }),
      workspaceRevision: 0,
      imageContentState: 'original',
      lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
    })
  );
  const db = await initDB();
  const read = db.transaction(stores, 'readonly');
  const initial = await freezeImageInTransaction(read, root.rootId);
  await read.done;
  const rootKey = captureRootKey(scope.spaceId, root.rootKind, root.rootId);
  table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: scope.spaceId,
    rootKind: root.rootKind,
    rootId: root.rootId,
    rootKey,
    generation: 1,
    basis: ['accepted-original'],
    nativeRevision: 0,
    nativeDigest: digestCapturedImageRows(initial),
  });
  const receiptKey = JSON.stringify(['applied-operation', scope.spaceId, 'accepted-original']);
  table('sync_capture').set(receiptKey, {
    version: 1,
    kind: 'applied-operation',
    key: receiptKey,
    createdAt: 1,
    spaceId: scope.spaceId,
    rootKey,
    operationId: 'accepted-original',
    sourceDigest: 'a'.repeat(64),
    generation: 1,
  });
  const document = createEditorDocumentFixture();
  const ref = {
    assetId: 'document-source',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/document-source' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  io.prepare.mockImplementation(async (value) => ({
    document: createPersistedEditorDocumentFixture(value, ref.assetId),
    objects: [],
    refs: [ref],
    runtimeAssetsByUrl: new Map(),
  }));
  const save = (expectedRevision: number) =>
    commitImageWorkspace({
      aggregateId: root.rootId,
      document,
      expectedRevision,
      requireExistingRoot: true,
    });
  const presentation = (revision: number) =>
    commitImagePresentation({
      aggregateId: root.rootId,
      expectedWorkspaceRevision: revision,
      previewBlob: new Blob(['late-render'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['late-thumbnail'], { type: 'image/webp' }),
    });
  async function pending() {
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(stores, 'readwrite');
      const value = await readCheckpointInTransaction(tx, scope, root);
      await tx.done;
      return value;
    });
  }
  async function freeze() {
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(stores, 'readwrite');
      const value = await readCheckpointInTransaction(tx, scope, root);
      if (!value) throw new Error('Missing document checkpoint');
      const captured = await captureRootCheckpointInTransaction(tx, value, { force: true });
      await tx.done;
      return captured;
    });
  }
  const state = () =>
    parseSyncCaptureRecord(
      table('sync_capture').get(
        JSON.stringify(['root-state', captureRootKey(scope.spaceId, root.rootKind, root.rootId)])
      )
    );
  return {
    ...fixture,
    table,
    save,
    presentation,
    pending,
    freeze,
    state,
    fail: () => {
      fail = true;
    },
    allow: () => {
      fail = false;
    },
  };
}

it('keeps a document checkpoint receipt current after presentation commit', async () => {
  const f = await setup();
  const accepted = await f.save(0);
  const pending = await f.pending();
  expect(accepted.checkpointReceipt).toBeDefined();
  expect(pending).not.toBeNull();
  expect(pending?.revision).toBe(accepted.checkpointReceipt?.revision);
  await f.presentation(1);
  expect(await f.pending()).toEqual(pending);
});

it('does not enqueue a late presentation after an immediate document checkpoint', async () => {
  const f = await setup();
  await f.save(0);
  const captured = await f.freeze();
  const before = structuredClone(f.table('sync_capture'));
  const state = f.state();
  expect(state).toMatchObject({ nativeRevision: 1 });
  const database = await initDB();
  const check = database.transaction(stores, 'readonly');
  const beforeRows = await freezeImageInTransaction(check, root.rootId);
  await check.done;
  expect(state).toMatchObject({ nativeDigest: digestCapturedImageRows(beforeRows) });
  await f.presentation(1);
  expect(await f.pending()).toBeNull();
  expect(f.state()).toEqual({ ...state, nativeDigest: expect.any(String) });
  for (const [key, value] of before) {
    if (key !== state?.key) expect(f.table('sync_capture').get(key)).toEqual(value);
  }
  expect(f.table('sync_capture').size).toBe(before.size);
  expect(captured?.phase).toBe('native');
  if (captured?.phase !== 'native' || captured.change.kind !== 'image')
    throw new Error('Image expected');
  expect(captured.change.rows.presentation).toBeNull();
  const db = await initDB();
  const tx = db.transaction(stores, 'readonly');
  const native = await freezeImageInTransaction(tx, root.rootId);
  await tx.done;
  expect(f.state()).toMatchObject({ nativeDigest: digestCapturedImageRows(native) });
});

it('does not rebase an authored pending revision through a presentation write', async () => {
  const f = await setup();
  await f.save(0);
  await f.freeze();
  const accepted = f.state();
  const saved = await f.save(1);
  const pending = await f.pending();
  expect(pending?.revision).toBe(saved.checkpointReceipt?.revision);
  expect(pending).not.toBeNull();
  await f.presentation(2);
  expect(f.state()).toEqual(accepted);
  expect(await f.pending()).toEqual(pending);
});

it('does not bless changed native metadata at an accepted document revision', async () => {
  const f = await setup();
  await f.save(0);
  await f.freeze();
  const state = f.state();
  const db = await initDB();
  const tx = db.transaction(stores, 'readwrite');
  const media = await tx.objectStore('media_library').get(root.rootId);
  const current = parseMediaLibraryEntry(media);
  if (!current) throw new Error('Missing image');
  await tx.objectStore('media_library').put({ ...current, tags: ['authored-after-checkpoint'] });
  await captureImageInTransaction(tx, root.rootId);
  await tx.done;
  const pending = await f.pending();
  expect(pending).not.toBeNull();
  await f.presentation(1);
  expect(f.state()).toEqual(state);
  expect(await f.pending()).toEqual(pending);
});

it('preserves an explicit flush request and deadline through repeated cache writes', async () => {
  const f = await setup();
  const saved = await f.save(0);
  const pending = await f.pending();
  if (!pending || !saved.checkpointReceipt) throw new Error('Expected document receipt');
  const requested = { ...pending, flushRequested: true as const };
  f.table('sync_capture').set(pending.key, requested);
  await f.presentation(1);
  await f.presentation(1);
  expect(await f.pending()).toEqual(requested);
  expect(saved.checkpointReceipt.revision).toBe(requested.revision);
  expect((await f.freeze())?.phase).toBe('native');
});

it('refuses a delayed renderer after a later document save or deletion', async () => {
  const f = await setup();
  await f.save(0);
  await f.save(1);
  const before = structuredClone(f.rows);
  await expect(f.presentation(1)).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(f.rows).toEqual(before);
  f.table('media_library').delete(root.rootId);
  const deleted = structuredClone(f.rows);
  await expect(f.presentation(2)).rejects.toMatchObject({ name: 'ImageAggregateNotFoundError' });
  expect(f.rows).toEqual(deleted);
});

it('rolls back a refused baseline write and permits an exact presentation retry', async () => {
  const f = await setup();
  await f.save(0);
  await f.freeze();
  const before = structuredClone(f.rows);
  f.fail();
  await expect(f.presentation(1)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(f.rows).toEqual(before);
  f.allow();
  await f.presentation(1);
  expect(await f.pending()).toBeNull();
  const db = await initDB();
  const tx = db.transaction(stores, 'readonly');
  const native = await freezeImageInTransaction(tx, root.rootId);
  await tx.done;
  expect(f.state()).toMatchObject({ nativeDigest: digestCapturedImageRows(native) });
});

it('keeps an applied source receipt valid after a clean presentation rebase', async () => {
  const f = await setup();
  const receiptKey = JSON.stringify(['applied-operation', scope.spaceId, 'accepted-original']);
  const receipt = structuredClone(f.table('sync_capture').get(receiptKey));
  await f.presentation(0);
  await f.save(0);
  expect((await f.freeze())?.basis).toEqual(['accepted-original']);
  expect(f.table('sync_capture').get(receiptKey)).toEqual(receipt);
});
