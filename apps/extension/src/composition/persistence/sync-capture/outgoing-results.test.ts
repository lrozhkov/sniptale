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

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function attempt(operationId = 'op', attemptId = FIRST): OutgoingDispatchAttemptDraft {
  const recordText = JSON.stringify({ operationId, attemptId });
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
  verifiedOutgoingResultKey,
} from './outgoing-results';

async function ready() {
  const f = await prepared();
  const first = await commitOutgoingDispatchAttempt(f.accepted, attempt());
  const second = await commitOutgoingDispatchAttempt(f.accepted, attempt('op', SECOND));
  return { ...f, first: first.attempt, second: second.attempt };
}

it('accepts the first verified result and returns it for idempotent and alternative physical attempts', async () => {
  const f = await ready();
  const before = structuredClone(f.rows);
  const accepted = await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(accepted.created).toBe(true);
  expect(accepted.result).toMatchObject({ attemptId: FIRST, remoteManifestKey: f.first.recordKey });
  expect(await commitVerifiedOutgoingResult(f.accepted, f.first)).toEqual({
    ...accepted,
    created: false,
  });
  expect(await commitVerifiedOutgoingResult(f.accepted, f.second)).toEqual({
    ...accepted,
    created: false,
  });
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
  expect(f.table('sync_outbox').size).toBe(before.get('sync_outbox')!.size + 1);
  expect(await loadVerifiedOutgoingResult('space', 3, 'op')).toEqual(accepted.result);
});

it('serializes controlled parallel results with the first physical receipt winning', async () => {
  const f = await ready();
  let release: () => void = () => undefined;
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

it('detaches unknown inputs before delayed admission', async () => {
  const f = await ready();
  const expected = structuredClone(f.accepted);
  const physical = structuredClone(f.first);
  let release: () => void = () => undefined;
  io.database.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const pending = commitVerifiedOutgoingResult(expected, physical);
  expected.captureSha256 = 'c'.repeat(64);
  physical.objects[0]!.remoteKey = 'changed';
  release();
  expect(await pending).toMatchObject({ result: { attemptId: FIRST }, created: true });
});

it('aborts native write failure and permits exact retry without changing source claims', async () => {
  const f = await ready();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitVerifiedOutgoingResult(f.accepted, f.first)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  expect(await commitVerifiedOutgoingResult(f.accepted, f.first)).toMatchObject({ created: true });
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
});

it.each(['disable', 'remove', 'rotate', 'recreate'])(
  'refuses delayed result after profile %s without changing retained evidence',
  async (kind) => {
    const f = await ready();
    let release: () => void = () => undefined;
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
        createdAt: kind === 'recreate' ? 9 : 1,
        enabled: kind !== 'disable',
        spaceId: 'space',
        connectionGeneration: kind === 'disable' ? 3 : 4,
      });
    const before = structuredClone(f.rows);
    release();
    await expect(pending).rejects.toThrow('changed');
    expect(f.rows).toEqual(before);
  }
);

it('keeps delayed publication bound to its retained capture after root deletion and recreation', async () => {
  const f = await ready();
  let release: () => void = () => undefined;
  io.database.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const pending = commitVerifiedOutgoingResult(f.accepted, f.first);
  f.table('sync_capture').set('deleted', {
    ...f.capture,
    operationId: 'deleted',
    generation: 2,
    change: { kind: 'tombstone' },
  });
  f.table('sync_capture').set('recreated', {
    ...f.capture,
    operationId: 'recreated',
    generation: 3,
  });
  const captures = structuredClone(f.table('sync_capture'));
  release();
  expect(await pending).toMatchObject({
    result: { operationId: 'op', captureSha256: f.accepted.captureSha256 },
  });
  expect(f.table('sync_capture')).toEqual(captures);
});

it.each(['capture', 'prepared', 'attempt', 'missing-attempt', 'foreign-generation'])(
  'refuses exact stored %s mismatch even when an accepted result already exists',
  async (kind) => {
    const f = await ready();
    await commitVerifiedOutgoingResult(f.accepted, f.first);
    if (kind === 'capture')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 99 });
    if (kind === 'prepared')
      f.table('sync_outbox').set(f.accepted.key, { ...f.accepted, createdAt: 99 });
    if (kind === 'attempt') f.table('sync_outbox').set(f.first.key, { ...f.first, createdAt: 99 });
    if (kind === 'missing-attempt') f.table('sync_outbox').delete(f.first.key);
    const candidate =
      kind === 'foreign-generation' ? { ...f.first, connectionGeneration: 4 } : f.first;
    const before = structuredClone(f.rows);
    await expect(commitVerifiedOutgoingResult(f.accepted, candidate)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it.each(['capture', 'prepared', 'attempt', 'receipt'])(
  'validates the %s join on write-free reads',
  async (kind) => {
    const f = await ready();
    const { result } = await commitVerifiedOutgoingResult(f.accepted, f.first);
    f.table('sync_capture').delete('profile');
    f.failWrites(true);
    const before = structuredClone(f.rows);
    expect(await loadVerifiedOutgoingResult('space', 3, 'op')).toEqual(result);
    expect(f.rows).toEqual(before);
    if (kind === 'capture') f.table('sync_capture').delete(f.capture.key);
    if (kind === 'prepared')
      f.table('sync_outbox').set(f.accepted.key, { ...f.accepted, recordText: 'corrupt' });
    if (kind === 'attempt')
      f.table('sync_outbox').set(f.first.key, { ...f.first, recordText: 'corrupt' });
    if (kind === 'receipt')
      f.table('sync_outbox').set(result.key, { ...result, attemptSha256: 'c'.repeat(64) });
    const corrupt = structuredClone(f.rows);
    await expect(loadVerifiedOutgoingResult('space', 3, 'op')).rejects.toThrow('Invalid');
    expect(f.rows).toEqual(corrupt);
  }
);

it('refuses contradictory receipts and prepared bytes without changing accepted evidence', async () => {
  const f = await ready();
  const { result } = await commitVerifiedOutgoingResult(f.accepted, f.first);
  f.table('sync_outbox').set(result.key, { ...result, preparedSha256: 'c'.repeat(64) });
  const before = structuredClone(f.rows);
  await expect(commitVerifiedOutgoingResult(f.accepted, f.second)).rejects.toThrow('Contradictory');
  expect(f.rows).toEqual(before);
  await expect(
    commitVerifiedOutgoingResult({ ...f.accepted, recordText: 'changed' }, f.first)
  ).rejects.toThrow('Invalid');
  expect(f.rows).toEqual(before);
});

it('uses disjoint namespace keys and refuses malformed receipt metadata', async () => {
  const f = await ready();
  expect(await loadVerifiedOutgoingResult('space', 3, 'op')).toBeNull();
  expect(verifiedOutgoingResultKey('space', 3, 'op')).not.toBe(
    verifiedOutgoingResultKey('space', 4, 'op')
  );
  const { result } = await commitVerifiedOutgoingResult(f.accepted, f.first);
  expect(parseVerifiedOutgoingResult(result)).toEqual(result);
  for (const invalid of [
    { ...result, attemptId: 'bad' },
    { ...result, remoteManifestKey: '../bad' },
    { ...result, key: 'bad' },
    { ...result, acceptedAt: -1 },
  ])
    expect(parseVerifiedOutgoingResult(invalid)).toBeNull();
  io.database.mockClear();
  await expect(loadVerifiedOutgoingResult('', 3, 'op')).rejects.toThrow('Invalid');
  await expect(loadVerifiedOutgoingResult('space', 0, 'op')).rejects.toThrow('Invalid');
  expect(io.database).not.toHaveBeenCalled();
});
