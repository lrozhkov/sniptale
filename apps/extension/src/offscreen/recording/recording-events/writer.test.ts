import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventRecord } from '../../../features/video/project/recording-events/records';
import { decodeRecordingEventsBlock } from '../../../features/video/project/recording-events/blocks';
import type { RecordingEventRecord } from '../../../features/video/project/recording-events/types';
import {
  isRecordingEventObservationPacket,
  type RecordingEventObservationPacket,
} from '../../../contracts/video/event-observations';
import type { RecordingPointTransform } from '../../../features/video/project/types';
import { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createBrowserRecordingEventsWriter } from './writer';

const clock = {
  source: 'dom-event-time' as const,
  timestampQuantumUs: null,
  resolutionBoundUs: null,
  mappingUncertaintyUs: 10,
};
const viewport = {
  width: 640,
  height: 400,
  devicePixelRatio: 1,
  visualViewportScale: 1,
  visualViewportOffsetX: 0,
  visualViewportOffsetY: 0,
};
const transform: RecordingPointTransform = {
  viewport,
  visibleClientRect: { x: 0, y: 0, width: 640, height: 400 },
  scaleX: 1 / 640,
  scaleY: 1 / 400,
  offsetX: 0,
  offsetY: 0,
};
const source = fixture.blocks
  .flatMap<unknown>((block) => block.value.records)
  .map((record) => {
    if (!isRecordingEventRecord(record)) throw new Error('Invalid source fixture.');
    return record.kind === 'segment' ? { ...record, clock } : record;
  });
function packet(
  records: unknown[],
  batchSequence = 0,
  clockRevision = 1
): RecordingEventObservationPacket {
  const result = {
    version: 1,
    recordingId: fixture.recordingId,
    sourceClockId: 'phase',
    batchSequence,
    clockRevision,
    clock,
    viewport,
    records,
  };
  if (!isRecordingEventObservationPacket(result)) throw new Error('Invalid source packet.');
  return result;
}
function click(
  id: string,
  recordSeq: number,
  activeTimeUs: number,
  segmentId = 0
): RecordingEventRecord {
  const template = source.find(
    (record) => record.kind === 'action' && record.action.kind === 'CLICK'
  );
  if (!template || template.kind !== 'action' || template.action.kind !== 'CLICK')
    throw new Error('Missing click.');
  return {
    ...template,
    recordSeq,
    segmentId,
    activeTimeUs,
    action: {
      ...structuredClone(template.action),
      id,
      timeUs: activeTimeUs,
      data: { ...template.action.data, lastObservedTimeUs: activeTimeUs },
    },
  };
}
function simple() {
  return packet([
    source[0]!,
    click('click-a', 1, 100000),
    { kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 200000, reason: 'stop' },
  ]);
}
const databases: { db: IDBPDatabase; name: string }[] = [];
let sequence = 0;
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  installPersistenceLockManagerForTests(null);
  for (const { db, name } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
async function setup(pointTransform: RecordingPointTransform | null = transform) {
  const name = `browser-events-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ db, name });
  const store = createRecordingEventsStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = { recordingId: fixture.recordingId, eventStreamId: fixture.eventStreamId };
  const writer = await createBrowserRecordingEventsWriter({
    ...identity,
    width: 1280,
    height: 800,
    store,
    pointTransform: () => pointTransform,
  });
  const read = async () => {
    const result: RecordingEventRecord[] = [];
    for (let index = 0; ; index++) {
      const packed = await store.readBlock(identity, index);
      if (!packed) break;
      const block = decodeRecordingEventsBlock(packed.bytes);
      if (!block) throw new Error('Invalid saved block.');
      result.push(...block.records);
    }
    return result;
  };
  return { db, store, identity, writer, read };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('persists original emission times, exact counts and missing-up facts without sorting delayed data', async () => {
  const { writer, read } = await setup();
  await writer.append(packet(source), 'document');
  const descriptor = await writer.finish();
  expect(descriptor).toMatchObject({ state: 'incomplete', finalized: true, totalRecords: 18 });
  const records = await read();
  expect(records.map((record) => record.activeTimeUs)).toEqual(
    source.map((record) => record.activeTimeUs)
  );
  expect(records[14]).toMatchObject({
    kind: 'action-update',
    activeTimeUs: 900000,
    data: { lastObservedTimeUs: 180000, upTimeUs: null },
  });
  expect(records[16]).toMatchObject({ signal: { data: { eventCount: 70000 } } });
});

it('maps browser points through the verified video transform rather than storing client coordinates', async () => {
  const { writer, read } = await setup({ ...transform, scaleX: 0.5 / 640, offsetX: 0.25 });
  await writer.append(simple(), 'document');
  expect((await writer.finish()).state).toBe('complete');
  expect((await read())[1]).toMatchObject({ action: { point: { x: 0.375, y: 0.75 } } });
});

it('keeps time and count facts with null positions and one warning when video geometry is unavailable', async () => {
  const { writer, read } = await setup(null);
  await writer.append(simple(), 'document');
  expect((await writer.finish()).state).toBe('incomplete');
  const records = await read();
  expect(records[1]).toMatchObject({ action: { id: 'click-a', timeUs: 100000, point: null } });
  expect(records.filter((record) => record.kind === 'signal')).toMatchObject([
    { signal: { data: { source: 'recording-events', code: 'source-unavailable' } } },
  ]);
});

it('accepts exact duplicate packets once and snapshots input before queued work', async () => {
  const { writer, read } = await setup();
  const input = simple();
  const pending = writer.append(input, 'document');
  const original = structuredClone(input);
  input.records[1] = click('late-mutation', 1, 100000);
  await pending;
  await writer.append(original, 'document');
  expect((await writer.finish()).totalRecords).toBe(3);
  expect((await read())[1]).toMatchObject({ action: { id: 'click-a' } });
});

it('keeps at most two accepted packet operations and permits retry after backpressure', async () => {
  const { writer, store } = await setup();
  const entered = deferred();
  const gate = deferred();
  const append = store.append.bind(store);
  vi.spyOn(store, 'append').mockImplementationOnce(async (token, block) => {
    entered.resolve();
    await gate.promise;
    await append(token, block);
  });
  const first = writer.append(simple(), 'document');
  await entered.promise;
  const second = writer.append(simple(), 'document');
  await expect(writer.append(simple(), 'document')).rejects.toThrow('BACKPRESSURE');
  gate.resolve();
  await Promise.all([first, second]);
  expect((await writer.finish()).totalRecords).toBe(3);
});

it('records a source gap on an unconfirmed document handoff and retains both valid prefixes', async () => {
  const { writer, read } = await setup();
  await writer.append(
    packet([source[0]!, click('before-navigation', 1, 100000)]),
    'document-before'
  );
  await writer.append(
    packet([
      { ...source[0]!, activeTimeUs: 200000 },
      click('after-navigation', 1, 250000),
      { kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 300000, reason: 'stop' },
    ]),
    'document-after'
  );
  expect((await writer.finish()).state).toBe('incomplete');
  const records = await read();
  expect(
    records.filter((record) => record.kind === 'action').map((record) => record.action.id)
  ).toEqual(['before-navigation', 'after-navigation']);
  expect(records.filter((record) => record.kind === 'gap')).toMatchObject([
    { reason: 'source-unavailable' },
  ]);
});

it('confirms Stop on an already paused prefix without a fake Resume or Stop record', async () => {
  const { writer, read } = await setup();
  await writer.append(
    packet([
      source[0]!,
      { kind: 'boundary', recordSeq: 1, segmentId: 0, activeTimeUs: 100000, reason: 'pause' },
    ]),
    'document'
  );
  const descriptor = await writer.finish({ stoppedWhilePaused: true });
  expect(descriptor).toMatchObject({ state: 'complete', totalRecords: 2 });
  expect((await read()).map((record) => record.kind)).toEqual(['segment', 'boundary']);
});

it('accepts a late Stop packet while the bounded final drain is pending', async () => {
  const { writer } = await setup();
  const finalizing = writer.finish({ waitForSourceStop: true });
  await writer.append(simple(), 'document');
  expect((await finalizing).state).toBe('complete');
});

it('preserves the last committed prefix after a later storage refusal', async () => {
  const { writer, store, identity, read } = await setup();
  await writer.append(
    packet([
      source[0]!,
      click('accepted', 1, 100000),
      { kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 200000, reason: 'pause' },
    ]),
    'document'
  );
  const before = await store.readBlock(identity, 0);
  vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('Storage refused.'));
  await expect(
    writer.append(
      packet(
        [
          { ...source[0]!, recordSeq: 3, segmentId: 1, activeTimeUs: 200000, reason: 'resume' },
          click('not-committed', 4, 300000, 1),
          { kind: 'boundary', recordSeq: 5, segmentId: 1, activeTimeUs: 400000, reason: 'stop' },
        ],
        1
      ),
      'document'
    )
  ).rejects.toThrow('Storage refused');
  expect(await writer.finish()).toMatchObject({ state: 'incomplete', totalRecords: 3 });
  expect(await store.readBlock(identity, 0)).toEqual(before);
  expect(
    (await read()).filter((record) => record.kind === 'action').map((record) => record.action.id)
  ).toEqual(['accepted']);
});

it('does not certify a missed physical completion as a complete capture', async () => {
  const { writer } = await setup();
  await writer.append(
    packet([
      source[0]!,
      source[1]!,
      { kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 900000, reason: 'stop' },
    ]),
    'document'
  );
  expect((await writer.finish()).state).toBe('incomplete');
});

it('retains a key binding across an explicit calibration segment change', async () => {
  const { writer, read } = await setup();
  await writer.append(packet([source[0]!, source[1]!]), 'document');
  const update = source[3]!;
  await writer.append(
    packet(
      [
        { ...update, recordSeq: 2 },
        { kind: 'boundary', recordSeq: 3, segmentId: 0, activeTimeUs: 50000, reason: 'stop' },
      ],
      1,
      2
    ),
    'document'
  );
  expect((await writer.finish()).state).toBe('complete');
  const records = await read();
  expect(records.filter((record) => record.kind === 'segment')).toHaveLength(2);
  expect(records.find((record) => record.kind === 'action-update')).toMatchObject({
    data: { upTimeUs: 40000, repeatCount: 3 },
  });
});

it('preserves an actual Stop boundary when its packet uses a newer clock calibration', async () => {
  const { writer, read } = await setup();
  await writer.append(packet([source[0]!, click('before-stop', 1, 100000)]), 'document');
  await writer.append(
    packet(
      [{ kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 200000, reason: 'stop' }],
      1,
      2
    ),
    'document'
  );
  expect((await writer.finish()).state).toBe('complete');
  const records = await read();
  expect(records.at(-1)).toMatchObject({ kind: 'boundary', activeTimeUs: 200000, reason: 'stop' });
  expect(records.some((record) => record.kind === 'segment' && record.reason === 'resume')).toBe(
    false
  );
});

it('includes a delayed Pause before confirming a paused Stop at the drain deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { writer, read } = await setup();
  await writer.append(packet([source[0]!, click('before-pause', 1, 100000)]), 'document');
  const finalizing = writer.finish({ waitForSourceStop: true, stoppedWhilePaused: true });
  await writer.append(
    packet(
      [{ kind: 'boundary', recordSeq: 2, segmentId: 0, activeTimeUs: 200000, reason: 'pause' }],
      1
    ),
    'document'
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect((await finalizing).state).toBe('complete');
  const records = await read();
  expect(records.at(-1)).toMatchObject({ kind: 'boundary', reason: 'pause' });
  expect(records.filter((record) => record.kind === 'segment')).toHaveLength(1);
});
