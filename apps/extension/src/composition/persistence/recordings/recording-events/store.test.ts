import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../../features/video/project/recording-events/blocks';
import { isRecordingEventRecord } from '../../../../features/video/project/recording-events/records';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_EVENTS_STORE as STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { createRecordingEventsStore } from './store';
import { admitStoredRecordingEventFact } from './facts';

let sequence = 0;
const databases: { name: string; db: IDBPDatabase }[] = [];
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  vi.restoreAllMocks();
  installPersistenceLockManagerForTests(null);
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
function pack(records: unknown[]) {
  const writer = createRecordingEventsBlockPacker(fixture.recordingId, fixture.eventStreamId);
  const blocks = records.flatMap((record) => writer.append(record));
  blocks.push(...writer.finish());
  return { blocks, descriptor: { ...fixture.descriptor, ...writer.summary() } };
}
const records = fixture.blocks
  .flatMap<unknown>((block) => block.value.records)
  .map((record) => {
    if (!isRecordingEventRecord(record)) throw new Error('Invalid fixture.');
    return record;
  });
const frozen = pack(records);
async function setup() {
  const name = `recording-events-store-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
  const store = createRecordingEventsStore(dependencies);
  const identity = { recordingId: fixture.recordingId, eventStreamId: fixture.eventStreamId };
  const writer = await store.begin(identity);
  return { db, store, identity, writer, dependencies };
}

it('retains frozen original blocks and indexes completed and delayed facts atomically', async () => {
  const { db, store, identity, writer } = await setup();
  for (const block of frozen.blocks) await store.append(writer, block);
  const head = await store.finalize(writer, fixture.descriptor);
  expect(head).toMatchObject({
    totalBlocks: 3,
    totalRecords: 18,
    totalBytes: 5528,
    streamSha256: frozen.descriptor.streamSha256,
    kind: 'head',
    finalized: true,
    hasGap: true,
  });
  for (const [index, block] of fixture.blocks.entries())
    expect(new TextDecoder().decode((await store.readBlock(identity, index))!.bytes)).toBe(
      block.utf8
    );
  const key = admitStoredRecordingEventFact(
    await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-1']),
    identity
  );
  expect(key.record).toMatchObject({
    kind: 'action',
    action: { data: { upTimeUs: 40000, repeatCount: 3 } },
  });
  expect(key.toTimeUs).toBe(40000);
  const lost = admitStoredRecordingEventFact(
    await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-f5']),
    identity
  );
  expect(lost.toTimeUs).toBe(180000);
  expect(lost.record).toMatchObject({
    action: { data: { lastObservedTimeUs: 180000, upTimeUs: null } },
  });
  expect(await store.finalize(writer, fixture.descriptor)).toEqual(head);
  await expect(store.append(writer, frozen.blocks[0]!)).resolves.toBeUndefined();
});

it('preserves all 5000 independent actions and 700 warning signals without lifetime compaction', async () => {
  const { db, store, writer } = await setup();
  const start = records[0]!;
  const click = records.find(
    (record) => record.kind === 'action' && record.action.kind === 'CLICK'
  )!;
  const signal = records.find(
    (record) => record.kind === 'signal' && record.signal.kind === 'static-frame'
  )!;
  if (click.kind !== 'action' || signal.kind !== 'signal')
    throw new Error('Invalid source fixtures.');
  const packer = createRecordingEventsBlockPacker(fixture.recordingId, fixture.eventStreamId);
  let recordSeq = 0;
  const append = async (record: unknown) => {
    for (const block of packer.append(record)) await store.append(writer, block);
  };
  await append({ ...start, recordSeq: recordSeq++ });
  for (let i = 0; i < 5000; i++)
    await append({
      ...click,
      recordSeq: recordSeq++,
      action: { ...click.action, id: `click-${i}` },
    });
  for (let i = 0; i < 700; i++)
    await append({
      ...signal,
      recordSeq: recordSeq++,
      signal: { ...signal.signal, id: `warning-${i}` },
    });
  await append({
    kind: 'boundary',
    segmentId: 0,
    recordSeq: recordSeq++,
    activeTimeUs: 900000,
    reason: 'stop',
  });
  for (const block of packer.finish()) await store.append(writer, block);
  const head = await store.finalize(writer, {
    ...fixture.descriptor,
    state: 'complete',
    ...packer.summary(),
  });
  expect(head.totalRecords).toBe(5702);
  expect(await db.countFromIndex(STORE, 'kind', 'fact')).toBe(5700);
  expect(
    await db.get(STORE, [writer.recordingId, writer.eventStreamId, 'fact', 'a:click-4999'])
  ).toBeDefined();
  expect(
    await db.get(STORE, [writer.recordingId, writer.eventStreamId, 'fact', 's:warning-699'])
  ).toBeDefined();
}, 60000);

it.each([
  'missing-action',
  'wrong-completion',
  'revision',
  'missing-owner',
  'lost-stretch',
] as const)('rolls back the entire block on %s', async (failure) => {
  const { db, store, identity, writer } = await setup();
  const changed = structuredClone(records.slice(0, 4));
  const update = changed[3]!;
  if (update.kind !== 'action-update') throw new Error('Missing update.');
  if (failure === 'missing-action') update.actionId = 'absent';
  if (failure === 'wrong-completion')
    update.data = {
      gestureType: 'click',
      completion: 'released',
      upTimeUs: 40000,
      pressDurationUs: null,
      lastObservedTimeUs: 40000,
      semanticEndTimeUs: null,
      dragStartTimeUs: null,
      pointerCancelled: null,
      dropObserved: null,
      upPoint: null,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
  if (failure === 'revision') update.revision = 2;
  if (failure === 'missing-owner') {
    const cadence = changed[2]!;
    if (cadence.kind !== 'keyboard-repeat-block') throw new Error('Missing cadence.');
    cadence.ownerId = 'absent';
  }
  if (failure === 'lost-stretch')
    update.data = {
      upTimeUs: null,
      pressDurationUs: null,
      lastObservedTimeUs: 900000,
      repeatCount: 3,
      completion: 'lost',
    };
  const candidate = pack(changed);
  await expect(store.append(writer, candidate.blocks[0]!)).rejects.toThrow();
  expect((await store.getHead(identity))?.totalBlocks).toBe(0);
  expect(await db.countFromIndex(STORE, 'kind', 'block')).toBe(0);
  expect(await db.countFromIndex(STORE, 'kind', 'fact')).toBe(0);
});

it('accepts identical parallel retries and refuses conflicting source bytes', async () => {
  const { store, writer, identity } = await setup();
  await Promise.all([
    store.append(writer, frozen.blocks[0]!),
    store.append(writer, frozen.blocks[0]!),
  ]);
  const before = await store.getHead(identity);
  const changed = structuredClone(records);
  const firstAction = changed[1]!;
  if (firstAction.kind !== 'action') throw new Error('Missing action.');
  firstAction.action.label = 'Ctrl+P';
  const alternative = pack(changed);
  await expect(store.append(writer, alternative.blocks[0]!)).rejects.toThrow();
  expect(await store.getHead(identity)).toEqual(before);
});

it('fences stale append, finalize and cleanup after retirement and same-identity restoration', async () => {
  const { store, writer, identity } = await setup();
  await store.append(writer, frozen.blocks[0]!);
  await store.retire(identity, writer.writerGeneration);
  await expect(store.begin(identity)).rejects.toThrow();
  await expect(store.append(writer, frozen.blocks[1]!)).rejects.toThrow();
  const restored = await store.restore(identity);
  expect(restored.writerGeneration).not.toBe(writer.writerGeneration);
  for (const block of frozen.blocks) await store.append(restored, block);
  await store.finalize(restored, frozen.descriptor);
  const before = await store.getHead(identity);
  await expect(store.append(writer, frozen.blocks[0]!)).rejects.toThrow();
  await expect(store.finalize(writer, frozen.descriptor)).rejects.toThrow();
  await expect(store.retire(identity, writer.writerGeneration)).rejects.toThrow();
  await expect(store.readBlock(identity, 0, writer.writerGeneration)).rejects.toThrow();
  expect(await store.getHead(identity)).toEqual(before);
});

it('does not certify a gap as complete and retains its accepted prefix after refusal', async () => {
  const { store, writer, identity } = await setup();
  for (const block of frozen.blocks) await store.append(writer, block);
  const before = await store.getHead(identity);
  await expect(
    store.finalize(writer, { ...frozen.descriptor, state: 'complete' })
  ).rejects.toThrow();
  expect(await store.getHead(identity)).toEqual(before);
  expect((await store.readBlock(identity, 2))?.bytes).toEqual(frozen.blocks[2]?.bytes);
});

it('refuses a false prefix digest during finalization without discarding source bytes', async () => {
  const { store, writer, identity } = await setup();
  for (const [index, block] of frozen.blocks.entries())
    await store.append(
      writer,
      index === 0 ? { ...block, entry: { ...block.entry, prefixSha256: 'b'.repeat(64) } } : block
    );
  await expect(store.finalize(writer, frozen.descriptor)).rejects.toThrow();
  expect((await store.getHead(identity))?.finalized).toBe(false);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(frozen.blocks[0]?.bytes);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('rechecks the writer generation after a finalization read races with deletion and restore', async () => {
  const { db, store, writer, identity, dependencies } = await setup();
  for (const block of frozen.blocks) await store.append(writer, block);
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(dependencies, 'database')
    .mockResolvedValueOnce(db)
    .mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return db;
    });
  const finalization = store.finalize(writer, frozen.descriptor);
  const refused = expect(finalization).rejects.toThrow();
  await entered.promise;
  await store.retire(identity, writer.writerGeneration);
  const restored = await store.restore(identity);
  for (const block of frozen.blocks) await store.append(restored, block);
  await store.finalize(restored, frozen.descriptor);
  const before = await store.getHead(identity);
  gate.resolve();
  await refused;
  expect(await store.getHead(identity)).toEqual(before);
});

it('does not recreate a retired identity when begin was delayed before its first transaction', async () => {
  const { db, store, dependencies } = await setup();
  const identity = { recordingId: 'delayed-begin', eventStreamId: fixture.eventStreamId };
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(dependencies, 'database').mockImplementationOnce(async () => {
    entered.resolve();
    await gate.promise;
    return db;
  });
  const begin = store.begin(identity);
  const refused = expect(begin).rejects.toThrow();
  await entered.promise;
  await store.retire(identity);
  gate.resolve();
  await refused;
  expect(await store.getHead(identity)).toBeNull();
});

it('resolves completion and cadence across block boundaries without rewriting the base block', async () => {
  const { db, store, writer, identity } = await setup();
  const source = records.find(
    (record) => record.kind === 'signal' && record.signal.kind === 'static-frame'
  );
  if (!source || source.kind !== 'signal') throw new Error('Missing signal.');
  const sourceRecords = [records[0]!, records[1]!];
  for (let i = 0; i < 510; i++)
    sourceRecords.push({
      ...source,
      recordSeq: sourceRecords.length,
      signal: { ...source.signal, id: `cross-block-${i}` },
    });
  sourceRecords.push({ ...records[2]!, recordSeq: sourceRecords.length });
  sourceRecords.push({ ...records[3]!, recordSeq: sourceRecords.length });
  sourceRecords.push({
    kind: 'boundary',
    segmentId: 0,
    recordSeq: sourceRecords.length,
    activeTimeUs: 900000,
    reason: 'stop',
  });
  const candidate = pack(sourceRecords);
  expect(candidate.blocks.length).toBeGreaterThan(1);
  await store.append(writer, candidate.blocks[0]!);
  const before = await store.readBlock(identity, 0);
  for (const block of candidate.blocks.slice(1)) await store.append(writer, block);
  await store.finalize(writer, { ...candidate.descriptor, state: 'complete' });
  expect(await store.readBlock(identity, 0)).toEqual(before);
  const fact = admitStoredRecordingEventFact(
    await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-1']),
    identity
  );
  expect(fact.record).toMatchObject({ action: { data: { repeatCount: 3, upTimeUs: 40000 } } });
  expect(fact.toTimeUs).toBe(40000);
});

it('retains both exact count fragments when anonymous typing exceeds 65535 observations', async () => {
  const { db, store, identity, writer } = await setup();
  const source = records.find(
    (record) => record.kind === 'signal' && record.signal.kind === 'typing'
  );
  if (!source || source.kind !== 'signal' || source.signal.kind !== 'typing')
    throw new Error('Missing typing source.');
  const first = {
    ...source,
    recordSeq: 1,
    activeTimeUs: 65534000000,
    signal: {
      ...source.signal,
      id: 'typing-first',
      startTimeUs: 0,
      endTimeUs: 65534000000,
      point: null,
      data: {
        ...source.signal.data,
        privacy: 'unknown',
        eventCount: 65535,
        groupId: null,
        continuationOf: null,
      },
    },
  };
  const second = {
    ...source,
    recordSeq: 2,
    activeTimeUs: 69999000000,
    signal: {
      ...source.signal,
      id: 'typing-second',
      startTimeUs: 65535000000,
      endTimeUs: 69999000000,
      point: null,
      data: {
        ...source.signal.data,
        privacy: 'unknown',
        eventCount: 4465,
        groupId: null,
        continuationOf: null,
      },
    },
  };
  const candidate = pack([
    records[0]!,
    first,
    second,
    { kind: 'boundary', segmentId: 0, recordSeq: 3, activeTimeUs: 70000000000, reason: 'stop' },
  ]);
  for (const block of candidate.blocks) await store.append(writer, block);
  await store.finalize(writer, { ...candidate.descriptor, state: 'complete' });
  const counts = [];
  for (const id of ['typing-first', 'typing-second']) {
    const fact = admitStoredRecordingEventFact(
      await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', `s:${id}`]),
      identity
    );
    if (fact.record.kind !== 'signal' || fact.record.signal.kind !== 'typing')
      throw new Error('Missing saved typing.');
    counts.push(fact.record.signal.data.eventCount);
  }
  expect(counts).toEqual([65535, 4465]);
});

it('accepts increasing completion revisions without requiring consecutive revision numbers', async () => {
  const { db, store, identity, writer } = await setup();
  const update = records[3]!;
  if (update.kind !== 'action-update') throw new Error('Missing update.');
  const candidate = pack([
    ...records.slice(0, 4),
    { ...update, recordSeq: 4, revision: 3 },
    { kind: 'boundary', recordSeq: 5, segmentId: 0, activeTimeUs: 50000, reason: 'stop' },
  ]);
  for (const block of candidate.blocks) await store.append(writer, block);
  await store.finalize(writer, { ...candidate.descriptor, state: 'complete' });
  expect(
    admitStoredRecordingEventFact(
      await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-1']),
      identity
    ).revision
  ).toBe(3);
});

it.each(['protected', 'unknown'] as const)(
  'does not attach per-key cadence to %s typing',
  async (privacy) => {
    const { db, store, writer } = await setup();
    const source = records[4]!;
    const cadence = records[5]!;
    if (
      source.kind !== 'signal' ||
      source.signal.kind !== 'typing' ||
      cadence.kind !== 'keyboard-repeat-block'
    )
      throw new Error('Missing typing cadence.');
    const typing = {
      ...source,
      recordSeq: 1,
      activeTimeUs: 0,
      signal: {
        ...source.signal,
        startTimeUs: 0,
        endTimeUs: 0,
        point: null,
        data: {
          ...source.signal.data,
          privacy,
          eventCount: privacy === 'protected' ? null : 3,
          groupId: null,
          continuationOf: null,
        },
      },
    };
    const candidate = pack([records[0]!, typing, { ...cadence, recordSeq: 2 }]);
    await expect(store.append(writer, candidate.blocks[0]!)).rejects.toThrow();
    expect(await db.countFromIndex(STORE, 'kind', 'fact')).toBe(0);
  }
);

it('keeps references valid across a clock segment change without altering original input times', async () => {
  const { db, store, writer, identity } = await setup();
  const start = records[0]!;
  const cadence = records[2]!;
  const update = records[3]!;
  if (
    start.kind !== 'segment' ||
    cadence.kind !== 'keyboard-repeat-block' ||
    update.kind !== 'action-update'
  )
    throw new Error('Missing source records.');
  const candidate = pack([
    start,
    records[1]!,
    {
      kind: 'boundary',
      recordSeq: 2,
      segmentId: 0,
      activeTimeUs: 20000,
      reason: 'clock-discontinuity',
    },
    { ...start, recordSeq: 3, segmentId: 1, activeTimeUs: 20000, reason: 'clock-discontinuity' },
    {
      ...cadence,
      recordSeq: 4,
      segmentId: 1,
      activeTimeUs: 50000,
      cadence: { ...cadence.cadence, startTimeUs: 30000 },
    },
    {
      ...update,
      recordSeq: 5,
      segmentId: 1,
      activeTimeUs: 60000,
      data: {
        upTimeUs: 60000,
        pressDurationUs: 60000,
        lastObservedTimeUs: 60000,
        repeatCount: 3,
        completion: 'released',
      },
    },
    { kind: 'boundary', recordSeq: 6, segmentId: 1, activeTimeUs: 70000, reason: 'stop' },
  ]);
  for (const block of candidate.blocks) await store.append(writer, block);
  await store.finalize(writer, { ...candidate.descriptor, state: 'complete' });
  expect(
    admitStoredRecordingEventFact(
      await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-1']),
      identity
    ).record
  ).toMatchObject({ action: { data: { downTimeUs: 0, upTimeUs: 60000, repeatCount: 3 } } });
});

it('preserves known aggregate repeat counts without requiring unavailable cadence', async () => {
  const { db, store, identity, writer } = await setup();
  const update = records[3]!;
  if (update.kind !== 'action-update') throw new Error('Missing update.');
  const candidate = pack([
    records[0]!,
    records[1]!,
    {
      ...update,
      recordSeq: 2,
      activeTimeUs: 30000,
      data: {
        upTimeUs: null,
        pressDurationUs: null,
        lastObservedTimeUs: 30000,
        repeatCount: 7,
        completion: 'observed',
      },
    },
    {
      ...update,
      recordSeq: 3,
      revision: 2,
      activeTimeUs: 900000,
      data: {
        upTimeUs: null,
        pressDurationUs: null,
        lastObservedTimeUs: 30000,
        repeatCount: 7,
        completion: 'lost',
      },
    },
    { kind: 'boundary', recordSeq: 4, segmentId: 0, activeTimeUs: 900000, reason: 'stop' },
  ]);
  for (const block of candidate.blocks) await store.append(writer, block);
  await store.finalize(writer, { ...candidate.descriptor, state: 'complete' });
  const fact = admitStoredRecordingEventFact(
    await db.get(STORE, [identity.recordingId, identity.eventStreamId, 'fact', 'a:key-1']),
    identity
  );
  expect(fact.toTimeUs).toBe(30000);
  expect(fact.record).toMatchObject({
    action: { data: { repeatCount: 7, lastObservedTimeUs: 30000, completion: 'lost' } },
  });
});

it('cannot certify complete capture while a known physical down lacks a completion fact', async () => {
  const { store, identity, writer } = await setup();
  const candidate = pack([
    records[0]!,
    records[1]!,
    { kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 900000, reason: 'stop' },
  ]);
  for (const block of candidate.blocks) await store.append(writer, block);
  const before = await store.getHead(identity);
  expect(before?.activeInputs).toBe(1);
  await expect(
    store.finalize(writer, { ...candidate.descriptor, state: 'complete' })
  ).rejects.toThrow();
  expect(await store.getHead(identity)).toEqual(before);
  await expect(
    store.finalize(writer, { ...candidate.descriptor, state: 'incomplete' })
  ).resolves.toMatchObject({ activeInputs: 1, finalized: true, state: 'incomplete' });
});

it('does not let a delayed begin adopt a new generation after deletion and explicit restore', async () => {
  const { db, store, identity, dependencies } = await setup();
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(dependencies, 'database').mockImplementationOnce(async () => {
    entered.resolve();
    await gate.promise;
    return db;
  });
  const pending = store.begin(identity);
  const refused = expect(pending).rejects.toThrow();
  await entered.promise;
  await store.retire(identity);
  const restored = await store.restore(identity);
  const before = await store.getHead(identity);
  gate.resolve();
  await refused;
  expect(await store.getHead(identity)).toEqual(before);
  expect(before?.writerGeneration).toBe(restored.writerGeneration);
});

it('admits the database before taking a mutation barrier that cold admission can need', async () => {
  const { db } = await setup();
  let admitted = false;
  const store = createRecordingEventsStore({
    database: async () => {
      admitted = true;
      return db;
    },
    mintGeneration: () => crypto.randomUUID(),
  });
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => {
      expect(admitted).toBe(true);
      return operation({});
    },
  });
  await store.begin({ recordingId: 'cold-admission-order', eventStreamId: fixture.eventStreamId });
});
