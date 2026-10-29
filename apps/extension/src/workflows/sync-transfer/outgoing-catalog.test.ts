import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import { beforeEach, expect, it, vi } from 'vitest';
import { capture, io, nextRevision, remote, resetOutgoingFixture } from './outgoing.test-support';
import type { AssetRef } from '../../composition/persistence/assets';
import { scanSyncCatalog } from './catalog';
import { dispatchPreparedOutgoing, prepareCapturedOutgoing } from './outgoing';

beforeEach(resetOutgoingFixture);

async function publishedCatalog() {
  const original = capture();
  await prepareCapturedOutgoing(original);
  const dav = remote();
  const first = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  const catalog = await scanSyncCatalog(dav.adapter, 'space', new AbortController().signal);
  expect(catalog.operations.size).toBe(1);
  io.attempts.clear();
  io.completed.clear();
  const next = nextRevision(original);
  if (next.change.kind === 'media') next.change.rows.media.sourceTitle = 'Other browser title';
  await prepareCapturedOutgoing(createNativeCapture(next));
  dav.reads.length = 0;
  dav.writes.length = 0;
  dav.stats.length = 0;
  return { dav, first, catalog, next };
}

it('reuses only published catalog mappings in another browser and after a module restart', async () => {
  const { dav, first, catalog, next } = await publishedCatalog();
  const second = await dispatchPreparedOutgoing(
    'space',
    next.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog }
  );
  expect(second.objects).toEqual(first.objects);
  expect(second.recordKey).not.toBe(first.recordKey);
  expect(dav.stats).toEqual(first.objects.map((item) => item.remoteKey));
  expect(dav.reads.filter((key) => key.startsWith('Files/'))).toEqual([]);
  expect(dav.writes).toEqual([second.recordKey]);
  expect(io.completed.size).toBe(0);

  const rescanned = await scanSyncCatalog(dav.adapter, 'space', new AbortController().signal);
  io.attempts.clear();
  const thirdCapture = nextRevision(next);
  await prepareCapturedOutgoing(thirdCapture);
  vi.resetModules();
  const restarted = await import('./outgoing');
  dav.reads.length = 0;
  dav.writes.length = 0;
  const third = await restarted.dispatchPreparedOutgoing(
    'space',
    thirdCapture.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog: rescanned }
  );
  expect(third.objects).toEqual(first.objects);
  expect(third.recordKey).not.toBe(second.recordKey);
  expect(dav.reads.filter((key) => key.startsWith('Files/'))).toEqual([]);
  expect(dav.writes).toEqual([third.recordKey]);
  expect(io.completed.size).toBe(0);
});

it('freezes catalog strings, mappings and exclusions before the first asynchronous source read', async () => {
  const { dav, first, catalog, next } = await publishedCatalog();
  const source = catalog.operations.get('operation')!;
  const physical = source.attempts[0]!;
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    physical.objects[0]!.remoteKey = 'Files/foreign/invalid/path/original.png';
    physical.recordKey = 'invalid';
    physical.operationText = '{}';
    source.operationText = '{}';
    source.operation.spaceId = 'foreign';
    catalog.pending.push('operation');
    catalog.quarantined.push('operation');
    catalog.invalidOperations.push('operation');
    catalog.invalid.push({ key: first.recordKey, code: 'invalid-manifest' });
    catalog.operations.clear();
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const second = await dispatchPreparedOutgoing(
    'space',
    next.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog }
  );
  expect(second.objects).toEqual(first.objects);
  expect(dav.stats).toEqual(first.objects.map((item) => item.remoteKey));
  expect(dav.writes).toEqual([second.recordKey]);
});

it.each([
  'pending',
  'quarantined',
  'invalidOperations',
  'invalid-key',
  'record-key',
  'mapping',
  'logical-bytes',
  'operation-id',
  'foreign-space',
  'attempt-operation',
] as const)('does not reuse a %s catalog candidate', async (kind) => {
  const { dav, first, catalog, next } = await publishedCatalog();
  const source = catalog.operations.get('operation')!;
  const physical = source.attempts[0]!;
  if (kind === 'pending' || kind === 'quarantined' || kind === 'invalidOperations')
    catalog[kind].push('operation');
  else if (kind === 'invalid-key')
    catalog.invalid.push({ key: first.recordKey, code: 'invalid-manifest' });
  else if (kind === 'record-key') physical.recordKey += '-changed';
  else if (kind === 'mapping')
    physical.objects[0]!.remoteKey = 'Files/foreign/invalid/path/original.png';
  else if (kind === 'logical-bytes') source.operationText = '{}';
  else if (kind === 'operation-id') source.operation.operationId = 'different-operation';
  else if (kind === 'foreign-space') source.operation.spaceId = 'foreign';
  else physical.operationText = '{}';
  const second = await dispatchPreparedOutgoing(
    'space',
    next.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog }
  );
  expect(second.objects[0]?.remoteKey).not.toBe(first.objects[0]?.remoteKey);
  expect(dav.stats).toEqual([]);
  expect(dav.writes.filter((key) => key.startsWith('Files/'))).toEqual(
    second.objects.map((item) => item.remoteKey)
  );
});

it.each(['missing', 'short', 'long'])(
  'replaces a %s stat-only candidate on a fresh path without overwriting it',
  async (kind) => {
    const { dav, first, catalog, next } = await publishedCatalog();
    const key = first.objects[0]!.remoteKey;
    if (kind === 'missing') dav.objects.delete(key);
    else dav.objects.set(key, new Blob([kind === 'short' ? 'x' : 'longer']));
    const previous = dav.objects.get(key);
    const second = await dispatchPreparedOutgoing(
      'space',
      next.operationId,
      dav.adapter,
      new AbortController().signal,
      { catalog }
    );
    expect(second.objects[0]?.remoteKey).not.toBe(key);
    expect(dav.objects.get(key)).toBe(previous);
    expect(dav.reads.filter((item) => item === key)).toEqual([]);
    expect(dav.writes).toEqual([second.objects[0]!.remoteKey, second.recordKey]);
  }
);

it('references same-size corruption without new completion or content verification', async () => {
  const { dav, first, catalog, next } = await publishedCatalog();
  const key = first.objects[0]!.remoteKey;
  dav.objects.set(key, new Blob(['bad']));
  const second = await dispatchPreparedOutgoing(
    'space',
    next.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog }
  );
  expect(second.objects[0]?.remoteKey).toBe(key);
  expect(dav.reads.filter((item) => item.startsWith('Files/'))).toEqual([]);
  expect(dav.writes).toEqual([second.recordKey]);
  expect(io.completed.size).toBe(0);
  expect(io.prepared.has(next.operationId)).toBe(true);
});

it('explicit catalog content recheck detects same-size corruption and verifies its replacement', async () => {
  const { dav, first, catalog, next } = await publishedCatalog();
  const key = first.objects[0]!.remoteKey;
  dav.objects.set(key, new Blob(['bad']));
  const second = await dispatchPreparedOutgoing(
    'space',
    next.operationId,
    dav.adapter,
    new AbortController().signal,
    { catalog, checkReusedContents: true }
  );
  expect(second.objects[0]?.remoteKey).not.toBe(key);
  expect(dav.reads.filter((item) => item.startsWith('Files/'))).toEqual([
    key,
    second.objects[0]!.remoteKey,
  ]);
  expect(dav.writes).toEqual([second.objects[0]!.remoteKey, second.recordKey]);
  expect(io.completed.size).toBe(1);
});

it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
  'refuses malformed stat size %s without publication',
  async (size) => {
    const { dav, catalog, next } = await publishedCatalog();
    await expect(
      dispatchPreparedOutgoing(
        'space',
        next.operationId,
        { ...dav.adapter, stat: async () => ({ size }) },
        new AbortController().signal,
        { catalog }
      )
    ).rejects.toThrow('invalid-response');
    expect(dav.writes).toEqual([]);
    expect(io.attempts.size).toBe(0);
    expect(io.completed.size).toBe(0);
  }
);
