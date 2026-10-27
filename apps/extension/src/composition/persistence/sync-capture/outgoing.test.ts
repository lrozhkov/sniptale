import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  commitPreparedOutgoingOperation,
  loadPreparedOutgoingOperation,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperationDraft,
} from './outgoing';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => vi.clearAllMocks());

function draft(capture: CapturedChange, text = '{"record":1}'): PreparedOutgoingOperationDraft {
  const refs = capture.change.kind === 'media' ? [capture.change.rows.ref] : [];
  return {
    version: 1,
    key: preparedOutgoingOperationKey(capture.spaceId, capture.operationId),
    createdAt: capture.createdAt,
    spaceId: capture.spaceId,
    connectionGeneration: capture.connectionGeneration,
    captureKey: capture.key,
    rootKey: capture.rootKey,
    generation: capture.generation,
    operationId: capture.operationId,
    recordText: text,
    recordSha256: Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    objects: refs.map((ref) => ({
      objectId: 'body',
      filename: 'original.png',
      ref,
      sha256: 'b'.repeat(64),
    })),
  };
}

function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_outbox');
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'image/png',
    sha256: 'b'.repeat(64),
    size: 6,
  };
  const media = createMediaLibraryEntry({
    id: 'project-asset:source',
    source: { kind: 'project-asset', projectAssetId: 'source' },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  const capture: CapturedChange = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","op"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'media',
      rows: {
        media,
        ref,
        projectAsset: {
          id: 'source',
          assetId: ref.assetId,
          mimeType: ref.mimeType,
          size: ref.size,
          createdAt: 1,
        },
      },
    },
  });
  table('sync_capture').set(capture.key, structuredClone(capture));
  return {
    ...fixture,
    table,
    capture,
    failWrites(value: boolean) {
      fail = value;
    },
  };
}

it('detaches admission inputs and replaces native rows with one portable payload', async () => {
  const f = setup();
  const proposed = draft(f.capture);
  const expected = structuredClone(proposed);
  const pending = commitPreparedOutgoingOperation(f.capture, proposed);
  proposed.recordText = 'changed';
  f.capture.generation++;
  expect(await pending).toMatchObject(expected);
  const stored = f.table('sync_capture').get(f.capture.key);
  expect(stored).toMatchObject({
    phase: 'prepared',
    prepared: {
      recordText: expected.recordText,
      recordSha256: expected.recordSha256,
      objects: expected.objects,
    },
  });
  expect(stored).not.toHaveProperty('change');
  expect([...f.table('sync_outbox').values()]).toEqual([
    expect.objectContaining({ kind: 'operation-locator' }),
  ]);
  expect(
    JSON.stringify([...f.rows.values()].flatMap((table) => [...table.values()])).match(
      /recordText/gu
    )
  ).toHaveLength(1);
});

it('returns the first accepted encoding on retry and controlled concurrent preparation', async () => {
  const f = setup();
  let release!: () => void;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const first = commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const second = commitPreparedOutgoingOperation(f.capture, draft(f.capture, '{"record":2}'));
  const accepted = await first;
  release();
  expect(await second).toEqual(accepted);
  expect(await loadPreparedOutgoingOperation('space', 'op')).toEqual(accepted);
});

it.each(['capture', 'missing', 'disabled', 'connection', 'lifetime', 'space'])(
  'refuses changed %s before replacing valid source data',
  async (kind) => {
    const f = setup();
    if (kind === 'capture')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 9 });
    if (kind === 'missing') f.table('sync_capture').delete(f.capture.key);
    if (!['capture', 'missing'].includes(kind))
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: kind === 'lifetime' ? 99 : 1,
        enabled: kind !== 'disabled',
        spaceId: kind === 'space' ? 'other' : 'space',
        connectionGeneration: kind === 'connection' ? 4 : 3,
      });
    const before = structuredClone(f.rows);
    await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('retains accepted older operations after deletion and recreation under the same root identity', async () => {
  const f = setup();
  const deletion = createNativeCapture({
    ...f.capture,
    key: 'deletion',
    operationId: 'deletion',
    generation: 2,
    change: { kind: 'tombstone' },
  });
  const recreated = createNativeCapture({
    ...f.capture,
    key: 'recreated',
    operationId: 'recreated',
    generation: 3,
  });
  f.table('sync_capture').set(deletion.key, deletion);
  f.table('sync_capture').set(recreated.key, recreated);
  const earlier = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  expect(await commitPreparedOutgoingOperation(recreated, draft(recreated))).not.toEqual(earlier);
  expect(await commitPreparedOutgoingOperation(deletion, draft(deletion))).toMatchObject({
    objects: [],
  });
});

it('rolls back source replacement and locator on write failure, then permits retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow(
    'No space'
  );
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  expect(f.table('sync_capture').get(f.capture.key)).toMatchObject({ phase: 'prepared' });
});

it.each(['digest', 'ref', 'filename', 'count', 'record-size', 'tombstone'])(
  'refuses invalid %s before database admission',
  async (kind) => {
    const f = setup();
    const proposed = draft(f.capture);
    if (kind === 'digest') proposed.recordSha256 = 'a'.repeat(64);
    if (kind === 'ref') proposed.objects[0]!.ref.size++;
    if (kind === 'filename') proposed.objects[0]!.filename = '';
    if (kind === 'count') proposed.objects = Array.from({ length: 65 }, () => proposed.objects[0]!);
    if (kind === 'record-size') proposed.recordText = 'x'.repeat(4 * 1024 * 1024 + 1);
    if (kind === 'tombstone') f.capture.change = { kind: 'tombstone' };
    await expect(commitPreparedOutgoingOperation(f.capture, proposed)).rejects.toThrow('Invalid');
    expect(io.database).not.toHaveBeenCalled();
  }
);

it.each(['locator', 'payload', 'lifetime'])(
  'refuses corrupted %s on write-free reads',
  async (kind) => {
    const f = setup();
    expect(await loadPreparedOutgoingOperation('space', 'op')).toBeNull();
    const prepared = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
    if (kind === 'locator')
      f.table('sync_outbox').set(prepared.key, { key: prepared.key, kind: 'old-experiment' });
    if (kind === 'lifetime')
      f.table('sync_outbox').set(prepared.key, {
        key: prepared.key,
        kind: 'operation-locator',
        captureKey: f.capture.key,
        spaceId: 'space',
        operationId: 'op',
        profileCreatedAt: 99,
        connectionGeneration: 3,
        sourceSha256: f.capture.sourceSha256,
      });
    if (kind === 'payload')
      f.table('sync_capture').set(f.capture.key, {
        ...f.capture,
        phase: 'prepared',
        prepared: { ...prepared, recordText: 'changed' },
      });
    const before = structuredClone(f.rows);
    await expect(loadPreparedOutgoingOperation('space', 'op')).rejects.toThrow('Invalid');
    expect(f.rows).toEqual(before);
  }
);
