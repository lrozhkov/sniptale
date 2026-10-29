import { collectSyncCaptureClaims } from './claims';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  commitPreparedOutgoingOperation,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperationDraft,
} from './outgoing';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) });
});

import {
  commitOutgoingDispatchAttempt,
  type OutgoingDispatchAttemptDraft,
} from './outgoing-attempts';
function preparedDraft(
  capture: CapturedChange,
  text = '{"record":1}'
): PreparedOutgoingOperationDraft {
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
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => fail && (name === 'sync_outbox' || name === 'sync_capture')
  );
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

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function attempt(operationId = 'op', attemptId = FIRST): OutgoingDispatchAttemptDraft {
  const objects = [{ objectId: 'body', remoteKey: `Originals/${attemptId}/original 100%.png` }];
  const recordText = JSON.stringify({
    format: 'sniptale-sync-attempt',
    version: 1,
    operationText: '{"record":1}',
    operationSha256: Array.from(sha256(new TextEncoder().encode('{"record":1}')), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    attemptId,
    objects,
  });
  return {
    version: 1,
    spaceId: 'space',
    operationId,
    connectionGeneration: 3,
    attemptId,
    preparedSha256: Array.from(sha256(new TextEncoder().encode('{"record":1}')), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    recordText,
    recordSha256: Array.from(sha256(new TextEncoder().encode(recordText)), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    recordKey: `attempts/${attemptId}/record.json`,
    objects: [{ objectId: 'body', remoteKey: `Originals/${attemptId}/original 100%.png` }],
  };
}

async function prepared() {
  const f = setup();
  const accepted = await commitPreparedOutgoingOperation(f.capture, preparedDraft(f.capture));
  return { ...f, accepted };
}

import {
  commitVerifiedOutgoingResult,
  loadVerifiedOutgoingResult,
  parseVerifiedOutgoingResult,
} from './outgoing-results';

async function ready() {
  const f = await prepared();
  const first = await commitOutgoingDispatchAttempt(f.accepted, attempt());
  const second = await commitOutgoingDispatchAttempt(f.accepted, attempt('op', SECOND));
  return { ...f, first: first.attempt, second: second.attempt };
}

it('replaces the single prepared payload with compact publication and retains immutable pins', async () => {
  const f = await ready();
  const accepted = await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(accepted).toMatchObject({
    created: true,
    result: {
      attemptId: FIRST,
      publicationKind: 'verified',
      captureSha256: f.capture.sourceSha256,
    },
  });
  expect(f.table('sync_capture').get(f.capture.key)).toMatchObject({
    phase: 'published',
    objects: [{ ref: f.accepted.objects[0]!.ref, pinned: true }],
  });
  const serialized = JSON.stringify([...f.rows.values()].flatMap((table) => [...table.values()]));
  expect(serialized).not.toContain('recordText');
  expect(serialized).not.toContain('"change":');
  expect(collectSyncCaptureClaims([...f.table('sync_capture').values()]).assetIds).toEqual(
    new Set(['body'])
  );
  expect(await commitVerifiedOutgoingResult(f.accepted, f.second)).toEqual({
    result: accepted.result,
    created: false,
  });
  f.table('sync_outbox').delete(f.first.key);
  f.table('sync_outbox').delete(f.second.key);
  expect(await loadVerifiedOutgoingResult('space', 3, 'op')).toEqual(accepted.result);
});

it('accepts the first publication under controlled parallel callbacks', async () => {
  const f = await ready();
  let release!: () => void;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const first = commitVerifiedOutgoingResult(f.accepted, f.first);
  const second = commitVerifiedOutgoingResult(f.accepted, f.second);
  const accepted = await first;
  release();
  expect(await second).toEqual({ result: accepted.result, created: false });
});

it('detaches callback inputs before delayed admission', async () => {
  const f = await ready();
  const prepared = structuredClone(f.accepted);
  const physical = structuredClone(f.first);
  let release!: () => void;
  io.database.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const pending = commitVerifiedOutgoingResult(prepared, physical);
  prepared.captureSha256 = 'c'.repeat(64);
  physical.objects[0]!.remoteKey = 'changed';
  release();
  expect(await pending).toMatchObject({ result: { attemptId: FIRST } });
});

it('rolls back failed compaction and preserves prepared bytes for an exact retry', async () => {
  const f = await ready();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitVerifiedOutgoingResult(f.accepted, f.first)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  expect(await commitVerifiedOutgoingResult(f.accepted, f.first)).toMatchObject({ created: true });
});

it('records a late acknowledgement after disabling capture without reopening controls', async () => {
  const f = await ready();
  f.table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: false,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const controls = { key: 'controls', kind: 'test-controls', status: 'cancelled', runId: null };
  f.table('sync_outbox').set(controls.key, controls);
  await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(f.table('sync_outbox').get(controls.key)).toEqual(controls);
  expect(f.table('sync_capture').get(f.capture.key)).toMatchObject({ phase: 'published' });
});

it.each(['remove', 'rotate', 'recreate'])(
  'refuses a delayed publication after enrollment %s',
  async (kind) => {
    const f = await ready();
    let release!: () => void;
    io.database.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(f.database);
        })
    );
    const pending = commitVerifiedOutgoingResult(f.accepted, f.first);
    if (kind === 'remove') f.table('sync_capture').delete('profile');
    else
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: kind === 'recreate' ? 99 : 1,
        enabled: true,
        spaceId: 'space',
        connectionGeneration: kind === 'rotate' ? 4 : 3,
      });
    const before = structuredClone(f.rows);
    release();
    await expect(pending).rejects.toThrow('changed');
    expect(f.rows).toEqual(before);
  }
);

it('keeps the old operation independent of same-root deletion and recreation', async () => {
  const f = await ready();
  const deletion = createNativeCapture({
    ...f.capture,
    key: 'deleted',
    operationId: 'deleted',
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
  await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(f.table('sync_capture').get(recreated.key)).toEqual(recreated);
  expect(f.table('sync_capture').get(deletion.key)).toEqual(deletion);
});

it.each(['source', 'missing-attempt', 'attempt', 'foreign-generation'])(
  'refuses corrupted %s before compaction',
  async (kind) => {
    const f = await ready();
    if (kind === 'source')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 99 });
    if (kind === 'missing-attempt') f.table('sync_outbox').delete(f.first.key);
    if (kind === 'attempt')
      f.table('sync_outbox').set(f.first.key, { ...f.first, recordSha256: 'a'.repeat(64) });
    const candidate =
      kind === 'foreign-generation' ? { ...f.first, connectionGeneration: 4 } : f.first;
    const before = structuredClone(f.rows);
    await expect(commitVerifiedOutgoingResult(f.accepted, candidate)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('parses compact receipts independently of property order and refuses invalid digests and paths', async () => {
  const f = await ready();
  const { result } = await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(parseVerifiedOutgoingResult(Object.fromEntries(Object.entries(result).reverse()))).toEqual(
    result
  );
  for (const invalid of [
    { ...result, attemptId: 'bad' },
    { ...result, remoteManifestKey: '../bad' },
    { ...result, key: 'bad' },
    { ...result, preparedSha256: 'bad' },
    { ...result, acceptedAt: -1 },
  ])
    expect(parseVerifiedOutgoingResult(invalid)).toBeNull();
  io.database.mockClear();
  await expect(loadVerifiedOutgoingResult('', 3, 'op')).rejects.toThrow('Invalid');
  await expect(loadVerifiedOutgoingResult('space', 0, 'op')).rejects.toThrow('Invalid');
  expect(io.database).not.toHaveBeenCalled();
});
