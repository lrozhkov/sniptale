import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores';
import { freezeImageInTransaction, digestCapturedImageRows } from '../sync-capture/image-snapshot';
import { captureImageInTransaction } from '../sync-capture/capture';
import { captureRootKey } from '../sync-capture/contracts';
import { createHarness } from './opfs-store.test-support';
import {
  unloadVerifiedAssetObject,
  restoreVerifiedAssetObject,
  type VerifiedAssetUnload,
} from './residency-maintenance';
import { assetResidencyCopyId } from './residency-records';

const io = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
beforeEach(() =>
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  })
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** This boundary fixture preserves compound presentation keys and caller-owned commit/abort. */
function databaseFixture() {
  const rows = new Map<string, Map<string, unknown>>(
    EXPECTED_STORES.map((name) => [name, new Map()])
  );
  let failStore: string | null = null;
  let failOrdinal = 1;
  const writes = new Map<string, number>();
  let onWrite = (_store: string) => {};
  const table = (name: string) => rows.get(name)!;
  const database = {
    transaction(names: string[], mode: string) {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') {
            rows.clear();
            for (const [name, values] of pending) rows.set(name, values);
          }
          return Promise.resolve();
        },
        objectStore(name: string) {
          if (!names.includes(name)) throw new Error('Store outside transaction');
          const store = pending.get(name)!;
          const write = async (value: unknown, add: boolean) => {
            if (mode !== 'readwrite' || !isRecord(value)) throw new Error('Invalid fixture write');
            const ordinal = (writes.get(name) ?? 0) + 1;
            writes.set(name, ordinal);
            if (name === failStore && ordinal === failOrdinal)
              throw new DOMException('No space', 'QuotaExceededError');
            const key =
              name === 'aggregate_presentations'
                ? JSON.stringify([value['aggregateKind'], value['aggregateId']])
                : name === 'sync_capture' || name === 'sync_connection'
                  ? value['key']
                  : (value['id'] ?? value['aggregateId']);
            if (typeof key !== 'string') throw new Error('Invalid fixture key');
            if (add && store.has(key)) throw new DOMException('Duplicate key', 'ConstraintError');
            store.set(key, structuredClone(value));
            onWrite(name);
          };
          return {
            get: async (key: IDBValidKey) =>
              structuredClone(store.get(typeof key === 'string' ? key : JSON.stringify(key))),
            getAll: async () => structuredClone([...store.values()]),
            index: (indexName: string) => {
              if (indexName !== 'projectId') throw new Error('Unsupported fixture index');
              return {
                getAll: async (key: string) =>
                  structuredClone(
                    [...store.values()].filter(
                      (value) => isRecord(value) && value['projectId'] === key
                    )
                  ),
              };
            },
            getAllKeys: async (
              range: { lower: string; upper: string; lowerOpen: boolean },
              count: number
            ) =>
              [...store.keys()]
                .sort()
                .filter(
                  (key) =>
                    key >= range.lower &&
                    key <= range.upper &&
                    (!range.lowerOpen || key !== range.lower)
                )
                .slice(0, count),
            put: (value: unknown) => write(value, false),
            add: (value: unknown) => write(value, true),
          };
        },
      };
    },
  };
  return {
    database,
    afterWrite: (effect: (store: string) => void) => {
      onWrite = effect;
    },
    rows,
    table,
    fault: (store: string, ordinal = 1) => {
      writes.clear();
      failStore = store;
      failOrdinal = ordinal;
    },
    allow: () => {
      failStore = null;
      writes.clear();
    },
  };
}

async function fixture(duplicate = true) {
  const f = databaseFixture();
  const source = new Blob(['abc']);
  const media = {
    ...createMediaLibraryEntry({
      id: 'image',
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      workspaceRevision: 0,
      size: source.size,
      blob: source,
    }),
    retainedField: { revision: 123 },
  };
  const presentation = {
    aggregateId: media.id,
    aggregateKind: 'image',
    presentationRevision: 0,
    previewBlob: duplicate ? new Blob(['abc'], { type: 'image/png' }) : new Blob(['edited']),
    thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    updatedAt: 2,
    retainedField: 'keep',
  };
  f.table('media_library').set(media.id, media);
  const presentationKey = JSON.stringify(['image', media.id]);
  f.table('aggregate_presentations').set(presentationKey, presentation);
  const rootKey = captureRootKey('space', 'media', media.id);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  f.table('sync_capture').set('profile', profile);
  const tx = f.database.transaction([...EXPECTED_STORES], 'readonly');
  // Browser boundary fixture implements only the transaction methods used by the native owner.
  const native = tx as unknown as Parameters<typeof freezeImageInTransaction>[0];
  const digest = digestCapturedImageRows(await freezeImageInTransaction(native, media.id));
  await tx.done;
  const state = {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: media.id,
    rootKey,
    generation: 1,
    basis: ['accepted'],
    nativeRevision: 0,
    nativeDigest: digest,
  };
  f.table('sync_capture').set(stateKey, state);
  const binding = {
    provider: 'webdav' as const,
    rootUrl: 'https://dav.example.test/root/',
    accountId: 'alice',
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 1,
  };
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
  const metadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  };
  f.table('sync_connection').set('connection', metadata);
  const input: VerifiedAssetUnload = {
    draft: {
      operationId: 'unload-1',
      lastUsedAt: 5,
      target: {
        kind: 'inline-image',
        mediaId: media.id,
        createdAt: media.createdAt,
        workspaceRevision: 0,
        rootGeneration: 1,
        nativeDigest: digest,
        size: source.size,
        mimeType: media.mimeType,
        blobType: source.type,
        ...(duplicate
          ? {
              duplicatePreview: {
                presentationRevision: 0,
                blobType: presentation.previewBlob.type,
              },
            }
          : {}),
      },
      remote: {
        binding,
        key: 'Originals/attempt/Снимок 100%.png',
        sha256: createHash('sha256').update('abc').digest('hex'),
      },
    },
    expectedRevision: null,
    authorization,
  };
  const harness = createHarness();
  io.db.mockResolvedValue(f.database);
  const unload = () => unloadVerifiedAssetObject(input, harness.options);
  const image = () => f.table('media_library').get(media.id);
  const preview = () => f.table('aggregate_presentations').get(presentationKey);
  return {
    ...f,
    ...harness,
    source,
    media,
    presentation,
    presentationKey,
    state,
    stateKey,
    input,
    profile,
    image,
    preview,
    unload,
    copyId: assetResidencyCopyId(input.draft.target),
  };
}

it('atomically unloads original and duplicate preview; retains metadata, thumbnail and generation', async () => {
  const f = await fixture();
  const { blob: _blob, ...media } = f.media;
  const { previewBlob: _preview, ...presentation } = f.presentation;
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
  expect(f.image()).toEqual(media);
  expect(f.preview()).toEqual(presentation);
  expect(f.table('aggregate_presentations').size).toBe(1);
  expect(f.table('sync_capture').get(f.stateKey)).toEqual(f.state);
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
});

it('restores original and duplicate preview with exact Blob types and unchanged native digest', async () => {
  const f = await fixture();
  const copy = await f.unload();
  if (copy === 'busy') throw new Error('Expected unloaded image');
  const input = {
    copy,
    sourceBlob: new Blob(['abc'], { type: 'application/octet-stream' }),
    authorization: f.input.authorization,
  };
  expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({
    phase: 'resident',
    revision: 3,
  });
  const image = f.image();
  const preview = f.preview();
  if (
    !isRecord(image) ||
    !(image['blob'] instanceof Blob) ||
    !isRecord(preview) ||
    !(preview['previewBlob'] instanceof Blob)
  )
    throw new Error('Restored bytes are missing');
  expect(await image['blob'].text()).toBe('abc');
  expect(image['blob'].type).toBe('');
  expect(await preview['previewBlob'].text()).toBe('abc');
  expect(preview['previewBlob'].type).toBe('image/png');
  expect(image).toEqual(f.media);
  expect(preview).toEqual(f.presentation);
  const tx = f.database.transaction([...EXPECTED_STORES], 'readonly');
  const native = tx as unknown as Parameters<typeof freezeImageInTransaction>[0];
  expect(digestCapturedImageRows(await freezeImageInTransaction(native, f.media.id))).toBe(
    f.state.nativeDigest
  );
  await tx.done;
  expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({
    phase: 'resident',
    revision: 3,
  });
  await expect(f.unload()).rejects.toThrow('cannot restart');
});

it('retains an independently rendered preview when it is not the original copy', async () => {
  const f = await fixture(false);
  expect(await f.unload()).toMatchObject({ phase: 'unloaded' });
  expect(f.preview()).toEqual(f.presentation);
  const row = f.image();
  expect(isRecord(row) && row['blob']).toBeUndefined();
});

it.each([
  ['media_library', 1],
  ['aggregate_presentations', 1],
  ['asset_residency', 1],
  ['asset_residency', 2],
] as const)(
  'aborts all unload effects on %s write %i refusal and permits retry',
  async (store, ordinal) => {
    const f = await fixture();
    f.fault(store, ordinal);
    await expect(f.unload()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(f.image()).toEqual(f.media);
    expect(f.preview()).toEqual(f.presentation);
    expect(f.table('asset_residency').size).toBe(0);
    f.allow();
    expect(await f.unload()).toMatchObject({ phase: 'unloaded' });
  }
);

it.each(['generation', 'digest', 'revision', 'lifetime', 'preview', 'disabled'] as const)(
  'refuses changed inline %s before releasing any bytes',
  async (change) => {
    const f = await fixture();
    if (change === 'generation')
      f.table('sync_capture').set(f.stateKey, { ...f.state, generation: 2 });
    if (change === 'digest')
      f.table('sync_capture').set(f.stateKey, { ...f.state, nativeDigest: 'a'.repeat(64) });
    if (change === 'revision')
      f.table('media_library').set(f.media.id, { ...f.media, workspaceRevision: 1 });
    if (change === 'lifetime')
      f.table('media_library').set(f.media.id, { ...f.media, createdAt: 2 });
    if (change === 'preview')
      f.table('aggregate_presentations').set(f.presentationKey, {
        ...f.presentation,
        presentationRevision: 1,
      });
    if (change === 'disabled')
      f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
    const before = structuredClone(f.rows);
    await expect(f.unload()).rejects.toThrow('changed');
    expect(f.rows).toEqual(before);
  }
);

it('protects a source with a real pending native capture', async () => {
  const f = await fixture();
  const tx = f.database.transaction([...EXPECTED_STORES], 'readwrite');
  const native = tx as unknown as Parameters<typeof captureImageInTransaction>[0];
  await captureImageInTransaction(native, f.media.id);
  await tx.done;
  await expect(f.unload()).rejects.toThrow('unfinished capture');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
  expect(f.table('asset_residency').size).toBe(0);
});

it('protects an offline pin through the current native editing closure', async () => {
  const f = await fixture();
  const id = JSON.stringify(['root', 'media', f.media.id]);
  f.table('asset_residency').set(id, {
    version: 1,
    kind: 'root',
    id,
    revision: 1,
    rootKind: 'media',
    rootId: f.media.id,
    pinned: true,
    lastUsedAt: 1,
  });
  await expect(f.unload()).rejects.toThrow('pinned offline');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
});

it('refuses wrong staged bytes and preserves the unloaded state', async () => {
  const f = await fixture();
  const copy = await f.unload();
  if (copy === 'busy') throw new Error('Expected unloaded source');
  const before = structuredClone(f.rows);
  await expect(
    restoreVerifiedAssetObject(
      { copy, sourceBlob: new Blob(['def']), authorization: f.input.authorization },
      f.options
    )
  ).rejects.toThrow('checksum mismatch');
  expect(f.rows).toEqual(before);
});

it.each(['media_library', 'aggregate_presentations', 'asset_residency'] as const)(
  'aborts all restore effects on %s refusal and permits retry',
  async (store) => {
    const f = await fixture();
    const copy = await f.unload();
    if (copy === 'busy') throw new Error('Expected unloaded source');
    const before = structuredClone(f.rows);
    f.fault(store);
    const input = { copy, sourceBlob: f.source, authorization: f.input.authorization };
    await expect(restoreVerifiedAssetObject(input, f.options)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(f.rows).toEqual(before);
    f.allow();
    expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({ phase: 'resident' });
    expect(f.image()).toEqual(f.media);
    expect(f.preview()).toEqual(f.presentation);
  }
);

it('refuses unexpected present bytes under an unloaded record without adopting or replacing them', async () => {
  const f = await fixture();
  const copy = await f.unload();
  if (copy === 'busy') throw new Error('Expected unloaded source');
  const row = f.image();
  if (!isRecord(row)) throw new Error('Missing media');
  f.table('media_library').set(f.media.id, { ...row, blob: new Blob(['foreign']) });
  const before = structuredClone(f.rows);
  await expect(
    restoreVerifiedAssetObject(
      { copy, sourceBlob: f.source, authorization: f.input.authorization },
      f.options
    )
  ).rejects.toThrow('unexpected bytes');
  expect(f.rows).toEqual(before);
});

it('refuses a matching unfinished native image publication journal', async () => {
  const f = await fixture();
  const root = await f.options.getOriginRoot();
  const assets = await root.getDirectoryHandle('sniptale-assets', { create: true });
  const ready = await assets.getDirectoryHandle('ready', { create: true });
  const marker = await ready.getFileHandle('pending', { create: true });
  const writable = await marker.createWritable();
  await writable.write(
    JSON.stringify({
      journalId: 'pending',
      domain: 'image-workspace',
      createdAt: 1,
      assetRefs: [],
      payload: { aggregateId: f.media.id },
    })
  );
  await writable.close();
  await expect(f.unload()).rejects.toThrow('unfinished publication');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
});

it('protects an inline source that a retained restore compensation can replace', async () => {
  const f = await fixture();
  f.table('asset_operations').set('restore', {
    kind: 'backup-restore',
    operationId: 'restore',
    createdAt: 1,
    updatedAt: 1,
    status: 'pending',
    obsoleteAssetIds: [],
    compensations: [
      {
        assetId: 'staged',
        journalId: 'journal',
        nextMediaId: f.media.id,
        nextOwnerId: 'owner',
        previousRecords: {},
      },
    ],
  });
  await expect(f.unload()).rejects.toThrow('unfinished restore');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
});

it('protects a borrowed inline source through a pinned Montage editing closure', async () => {
  const f = await fixture();
  const montage = createVideoProjectEntryWithMediaClip();
  const source = montage.project.assets[0]!;
  source.type = VideoProjectAssetType.IMAGE;
  source.source = { kind: 'library-asset', mediaId: f.media.id };
  source.metadata = {
    ...source.metadata,
    mimeType: f.media.mimeType,
    size: f.media.size,
    width: 10,
    height: 10,
    duration: null,
    hasAudio: false,
  };
  f.table('video_projects').set(montage.id, montage);
  const id = JSON.stringify(['root', 'video-project', montage.id]);
  f.table('asset_residency').set(id, {
    version: 1,
    kind: 'root',
    id,
    revision: 1,
    rootKind: 'video-project',
    rootId: montage.id,
    pinned: true,
    lastUsedAt: 1,
  });
  await expect(f.unload()).rejects.toThrow('pinned offline');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
});

it('returns busy while a native reader protects inline original and preview', async () => {
  const f = await fixture();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, operation: (lock: null) => unknown) =>
        operation(null),
    },
  });
  expect(await f.unload()).toBe('busy');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
  expect(f.table('asset_residency').size).toBe(0);
});

it('refuses a native replacement during a controlled database admission wait', async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.db.mockImplementationOnce(async () => {
    entered();
    await gate;
    return f.database;
  });
  const command = f.unload();
  await started;
  f.table('sync_capture').set(f.stateKey, { ...f.state, generation: 2 });
  release();
  await expect(command).rejects.toThrow('source changed');
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
});

it('aborts inline byte removal if cancellation arrives before transaction commit', async () => {
  const f = await fixture();
  const controller = new AbortController();
  f.input.signal = controller.signal;
  f.afterWrite((store) => {
    if (store === 'media_library') controller.abort();
  });
  await expect(f.unload()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.image()).toEqual(f.media);
  expect(f.preview()).toEqual(f.presentation);
  expect(f.table('asset_residency').size).toBe(0);
});

it('aborts inline restore if cancellation arrives before transaction commit', async () => {
  const f = await fixture();
  const copy = await f.unload();
  if (copy === 'busy') throw new Error('Expected unloaded source');
  const before = structuredClone(f.rows);
  const controller = new AbortController();
  f.afterWrite((store) => {
    if (store === 'media_library') controller.abort();
  });
  await expect(
    restoreVerifiedAssetObject(
      {
        copy,
        sourceBlob: f.source,
        authorization: f.input.authorization,
        signal: controller.signal,
      },
      f.options
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.rows).toEqual(before);
});
