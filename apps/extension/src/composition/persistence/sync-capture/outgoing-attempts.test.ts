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
beforeEach(() => vi.clearAllMocks());

import {
  commitOutgoingDispatchAttempt,
  loadOutgoingDispatchAttempt,
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

it('detaches the complete expected and draft evidence before awaiting admission', async () => {
  const f = await prepared();
  const proposed = attempt();
  const expected = structuredClone(proposed);
  io.database.mockResolvedValue(f.database);
  const pending = commitOutgoingDispatchAttempt(f.accepted, proposed);
  proposed.objects[0]!.remoteKey = 'changed';
  proposed.recordText = 'changed';
  f.accepted.captureSha256 = 'c'.repeat(64);
  expect(await pending).toMatchObject({ attempt: expected, created: true });
});

it('retains independent attempts from concurrent callers with controlled admission ordering', async () => {
  const f = await prepared();
  const a = attempt();
  const b = attempt('op', SECOND);
  let admitSecond: () => void = () => undefined;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        admitSecond = () => resolve(f.database);
      })
  );
  const first = commitOutgoingDispatchAttempt(f.accepted, a);
  const second = commitOutgoingDispatchAttempt(f.accepted, b);
  const acceptedFirst = await first;
  admitSecond();
  const acceptedSecond = await second;
  expect(acceptedFirst.attempt.key).not.toBe(acceptedSecond.attempt.key);
  expect(acceptedFirst.attempt.preparedSha256).toBe(acceptedSecond.attempt.preparedSha256);
  expect(f.table('sync_outbox').size).toBe(3);
});

it('returns exact accepted evidence on retry and refuses contradictory identity reuse', async () => {
  const f = await prepared();
  const proposed = attempt();
  io.database.mockResolvedValue(f.database);
  const accepted = await commitOutgoingDispatchAttempt(f.accepted, proposed);
  expect(await commitOutgoingDispatchAttempt(f.accepted, proposed)).toEqual({
    attempt: accepted.attempt,
    created: false,
  });
  const before = structuredClone(f.rows);
  proposed.objects[0]!.remoteKey = 'Originals/different.png';
  await expect(commitOutgoingDispatchAttempt(f.accepted, proposed)).rejects.toThrow(
    'Contradictory'
  );
  expect(f.rows).toEqual(before);
});

it('retains old captured evidence after deletion and identity recreation', async () => {
  const f = await prepared();
  const proposed = attempt();
  io.database.mockResolvedValue(f.database);
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
  f.table('sync_capture').set('latest', { kind: 'root-state', generation: 3 });
  expect(await commitOutgoingDispatchAttempt(f.accepted, proposed)).toMatchObject({
    attempt: proposed,
    created: true,
  });
  const wrongOperation = { ...proposed, operationId: 'recreated' };
  await expect(commitOutgoingDispatchAttempt(f.accepted, wrongOperation)).rejects.toThrow(
    'Invalid'
  );
});

it('aborts a failed commit and permits exact retry without changing captures or preparation', async () => {
  const f = await prepared();
  const proposed = attempt();
  io.database.mockResolvedValue(f.database);
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitOutgoingDispatchAttempt(f.accepted, proposed)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  expect(await commitOutgoingDispatchAttempt(f.accepted, proposed)).toMatchObject({
    attempt: proposed,
    created: true,
  });
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
  expect(f.table('sync_outbox').get(f.accepted.key)).toEqual(f.accepted);
});

it.each(['disabled', 'connection', 'space', 'capture', 'missing-capture', 'prepared'])(
  'refuses stale %s evidence without changing any durable rows',
  async (kind) => {
    const f = await prepared();
    const proposed = attempt();
    io.database.mockResolvedValue(f.database);
    const profile = {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'space',
      connectionGeneration: 3,
    };
    if (kind === 'disabled') profile.enabled = false;
    if (kind === 'connection') profile.connectionGeneration = 4;
    if (kind === 'space') profile.spaceId = 'other';
    f.table('sync_capture').set('profile', profile);
    if (kind === 'capture')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 99 });
    if (kind === 'missing-capture') f.table('sync_capture').delete(f.capture.key);
    if (kind === 'prepared')
      f.table('sync_outbox').set(f.accepted.key, { ...f.accepted, createdAt: 99 });
    const before = structuredClone(f.rows);
    await expect(commitOutgoingDispatchAttempt(f.accepted, proposed)).rejects.toThrow('changed');
    expect(f.rows).toEqual(before);
  }
);

it.each([
  'uuid',
  'digest',
  'prepared-digest',
  'inventory',
  'duplicate-id',
  'duplicate-key',
  'path',
  'manifest-key',
  'size',
  'utf8-size',
  'count',
])('refuses invalid %s before database access', async (kind) => {
  const f = await prepared();
  const proposed = attempt();
  if (kind === 'uuid') proposed.attemptId = '../bad';
  if (kind === 'digest') proposed.recordSha256 = 'c'.repeat(64);
  if (kind === 'prepared-digest') proposed.preparedSha256 = 'c'.repeat(64);
  if (kind === 'inventory') proposed.objects = [];
  if (kind === 'duplicate-id')
    proposed.objects.push({ ...proposed.objects[0]!, remoteKey: 'other' });
  if (kind === 'duplicate-key')
    proposed.objects.push({ ...proposed.objects[0]!, objectId: 'other' });
  if (kind === 'path') proposed.objects[0]!.remoteKey = '../outside';
  if (kind === 'manifest-key') proposed.objects[0]!.remoteKey = proposed.recordKey;
  if (kind === 'size') proposed.recordText = 'x'.repeat(4 * 1024 * 1024 + 1);
  if (kind === 'count') proposed.objects = Array.from({ length: 65 }, () => proposed.objects[0]!);
  if (kind === 'utf8-size') {
    proposed.recordText = 'я'.repeat(3 * 1024 * 1024);
    proposed.recordSha256 = Array.from(
      sha256(new TextEncoder().encode(proposed.recordText)),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join('');
  }
  io.database.mockClear();
  await expect(commitOutgoingDispatchAttempt(f.accepted, proposed)).rejects.toThrow('Invalid');
  expect(io.database).not.toHaveBeenCalled();
});

it('loads retained evidence without writes or current profile authority and refuses corrupt text', async () => {
  const f = await prepared();
  const proposed = attempt();
  io.database.mockResolvedValue(f.database);
  expect(await loadOutgoingDispatchAttempt('space', 'op', FIRST)).toBeNull();
  const accepted = await commitOutgoingDispatchAttempt(f.accepted, proposed);
  f.table('sync_capture').delete('profile');
  f.failWrites(true);
  const before = structuredClone(f.rows);
  expect(await loadOutgoingDispatchAttempt('space', 'op', FIRST)).toEqual(accepted.attempt);
  expect(f.rows).toEqual(before);
  f.table('sync_outbox').set(accepted.attempt.key, { ...accepted.attempt, recordText: 'corrupt' });
  await expect(loadOutgoingDispatchAttempt('space', 'op', FIRST)).rejects.toThrow('Invalid');
});

it.each(['space', 'operation', 'attempt'])(
  'refuses invalid load %s before database access',
  async (kind) => {
    io.database.mockClear();
    await expect(
      loadOutgoingDispatchAttempt(
        kind === 'space' ? '' : 'space',
        kind === 'operation' ? '' : 'op',
        kind === 'attempt' ? 'not-a-uuid' : FIRST
      )
    ).rejects.toThrow('Invalid');
    expect(io.database).not.toHaveBeenCalled();
  }
);
