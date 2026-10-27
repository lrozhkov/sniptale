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
    createdAt: 2,
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
    attemptKey: `attempts/${capture.operationId}/record.json`,
    objects: refs.map((ref) => ({
      objectId: 'body',
      remoteKey: 'objects/body',
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
  const capture: CapturedChange = {
    version: 1,
    kind: 'captured-change',
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
  };
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

it('detaches the draft and expected capture before awaiting database admission', async () => {
  const f = setup();
  const proposed = draft(f.capture);
  const expected = structuredClone(proposed);
  const pending = commitPreparedOutgoingOperation(f.capture, proposed);
  proposed.recordText = 'caller changed';
  proposed.objects[0]!.ref.location.objectKey = 'objects/changed';
  f.capture.generation = 100;
  expect(await pending).toMatchObject(expected);
});

it('returns the first accepted bytes, objects, and attempt key for a different repeated proposal', async () => {
  const f = setup();
  const first = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const alternative = draft(f.capture, '{"record":2}');
  alternative.attemptKey = 'attempts/different.json';
  alternative.objects[0]!.remoteKey = 'objects/different';
  expect(await commitPreparedOutgoingOperation(f.capture, alternative)).toEqual(first);
  expect([...f.table('sync_outbox').values()]).toEqual([first]);
});

it.each(['capture', 'profile', 'connection', 'space', 'missing'])(
  'refuses changed %s evidence without mutation',
  async (change) => {
    const f = setup();
    const proposed = draft(f.capture);
    if (change === 'capture')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 9 });
    if (change === 'missing') f.table('sync_capture').delete(f.capture.key);
    if (change === 'profile' || change === 'connection' || change === 'space')
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: 1,
        enabled: change !== 'profile',
        spaceId: change === 'space' ? 'other' : 'space',
        connectionGeneration: change === 'connection' ? 4 : 3,
      });
    const before = structuredClone(f.rows);
    await expect(commitPreparedOutgoingOperation(f.capture, proposed)).rejects.toThrow('changed');
    expect(f.rows).toEqual(before);
  }
);

it('keeps an earlier capture usable after deletion and recreation with independent operation IDs', async () => {
  const f = setup();
  const deletion: CapturedChange = {
    ...f.capture,
    key: 'deleted',
    operationId: 'deleted',
    generation: 2,
    change: { kind: 'tombstone' },
  };
  const recreated: CapturedChange = {
    ...f.capture,
    key: 'recreated',
    operationId: 'recreated',
    generation: 3,
  };
  f.table('sync_capture').set(deletion.key, deletion);
  f.table('sync_capture').set(recreated.key, recreated);
  f.table('sync_capture').set('latest', { kind: 'root-state', generation: 3 });
  const earlier = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const newer = await commitPreparedOutgoingOperation(recreated, draft(recreated));
  expect(newer.key).not.toBe(earlier.key);
  expect(await commitPreparedOutgoingOperation(deletion, draft(deletion))).toMatchObject({
    objects: [],
  });
  expect(f.table('sync_outbox').size).toBe(3);
});

it('rolls back a failed commit and permits retry while preserving capture and source claims', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow(
    'No space'
  );
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  expect(await commitPreparedOutgoingOperation(f.capture, draft(f.capture))).toMatchObject(
    draft(f.capture)
  );
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
});

it('refuses contradictory accepted identity and preserves the original evidence', async () => {
  const f = setup();
  const accepted = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const corrupted = { ...accepted, captureKey: 'other' };
  f.table('sync_outbox').set(corrupted.key, corrupted);
  const before = structuredClone(f.rows);
  await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow(
    'Invalid accepted'
  );
  expect(f.rows).toEqual(before);
});

it('loads accepted bytes without writes and refuses corrupt stored bytes', async () => {
  const f = setup();
  expect(await loadPreparedOutgoingOperation('space', 'op')).toBeNull();
  const accepted = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const before = structuredClone(f.rows);
  f.failWrites(true);
  expect(await loadPreparedOutgoingOperation('space', 'op')).toEqual(accepted);
  expect(f.rows).toEqual(before);
  f.table('sync_outbox').set(accepted.key, { ...accepted, recordText: 'corrupt' });
  await expect(loadPreparedOutgoingOperation('space', 'op')).rejects.toThrow('Invalid prepared');
});

it.each(['digest', 'ref', 'path', 'count', 'record-size', 'tombstone'])(
  'refuses invalid %s before database admission',
  async (kind) => {
    const f = setup();
    const proposed = draft(f.capture);
    if (kind === 'digest') proposed.recordSha256 = 'a'.repeat(64);
    if (kind === 'ref') proposed.objects[0]!.ref.size++;
    if (kind === 'path') proposed.attemptKey = '../outside';
    if (kind === 'count') proposed.objects = Array.from({ length: 65 }, () => proposed.objects[0]!);
    if (kind === 'record-size') proposed.recordText = 'x'.repeat(4 * 1024 * 1024 + 1);
    if (kind === 'tombstone') f.capture.change = { kind: 'tombstone' };
    await expect(commitPreparedOutgoingOperation(f.capture, proposed)).rejects.toThrow(
      'Invalid outgoing'
    );
    expect(io.database).not.toHaveBeenCalled();
  }
);

it('refuses accepted bytes after retained capture metadata changes under identical IDs and refs', async () => {
  const f = setup();
  await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const changed = { ...f.capture, createdAt: 99 };
  f.table('sync_capture').set(changed.key, structuredClone(changed));
  const before = structuredClone(f.rows);
  await expect(commitPreparedOutgoingOperation(changed, draft(changed))).rejects.toThrow(
    'Invalid accepted'
  );
  expect(f.rows).toEqual(before);
});

it('retains ordinary filename spaces and literal percent characters in relative remote keys', async () => {
  const f = setup();
  const proposed = draft(f.capture);
  proposed.attemptKey = 'attempts/100% original.json';
  proposed.objects[0]!.remoteKey = 'objects/original 100%.png';
  expect(await commitPreparedOutgoingOperation(f.capture, proposed)).toMatchObject(proposed);
});
