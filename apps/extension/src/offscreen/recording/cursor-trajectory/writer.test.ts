import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBrowserCursorTrajectoryWriter } from './writer';
import type {
  RecordingCursorObservation,
  RecordingCursorObservationPacket,
} from '../../../contracts/video/cursor-observations';
import type { RecordingPointTransform } from '../../../features/video/project/types';
import type { CursorTrajectoryRecord } from '../../../features/video/project/cursor-trajectory/types';
import { decodeCursorTrajectoryBlock } from '../../../features/video/project/cursor-trajectory/blocks';
import { isCursorTrajectoryDescriptor } from '../../../features/video/project/cursor-trajectory/records';
import { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../../composition/persistence/infrastructure/indexed-db/core.stores';

const identity = {
  recordingId: 'recording-browser-cursor',
  trajectoryId: '0123456789abcdef0123456789abcdef',
};
const viewport = {
  width: 640,
  height: 400,
  devicePixelRatio: 2,
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
const databases: { name: string; db: IDBPDatabase }[] = [];
let databaseSequence = 0;
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

function sample(
  localSequence: number,
  activeTimeUs: number,
  x: number,
  event: 'move' | 'down' | 'up' | 'click' = 'move'
): RecordingCursorObservation {
  return {
    kind: 'sample',
    localSequence,
    activeTimeUs,
    x,
    y: 100,
    observed: true,
    visible: true,
    event,
    button: event === 'move' ? 'none' : 'left',
    relatedLocalSequence: event === 'click' ? localSequence - 1 : null,
  };
}
function packet(
  records: RecordingCursorObservation[],
  batchSequence = 0
): RecordingCursorObservationPacket {
  return {
    version: 1,
    recordingId: identity.recordingId,
    batchSequence,
    sourceClockId: 'clock-1',
    clockRevision: 1,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: 1000,
    },
    viewport,
    records,
  };
}
async function setup(pointTransform: () => RecordingPointTransform | null = () => transform) {
  const name = `browser-cursor-${++databaseSequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const writer = await createBrowserCursorTrajectoryWriter({
    ...identity,
    width: 1280,
    height: 800,
    store,
    pointTransform,
  });
  const records = async () => {
    const all: CursorTrajectoryRecord[] = [];
    for (let sequence = 0; ; sequence += 1) {
      const row = await store.readBlock(identity, sequence);
      if (!row) break;
      const parsed = decodeCursorTrajectoryBlock(row.bytes, row.initialSegment);
      if (!parsed) throw new Error('Invalid stored block');
      all.push(...parsed.records);
    }
    return all;
  };
  return { store, writer, records };
}

it('projects the frame once and retains event timestamps and the proven raw click link', async () => {
  const { writer, records } = await setup();
  await writer.append(
    packet([
      sample(0, 0, 100),
      sample(1, 10000, 110, 'down'),
      sample(2, 20000, 120, 'up'),
      sample(3, 25000, 120, 'click'),
      { kind: 'boundary', activeTimeUs: 30000, reason: 'stop' },
    ]),
    'native-doc'
  );
  const result = await writer.finish();
  expect(isCursorTrajectoryDescriptor(result)).toBe(true);
  expect(result.state).toBe('complete');
  const samples = (await records()).filter((value) => value.kind === 'sample');
  expect(samples.map((point) => point.activeTimeUs)).toEqual([0, 10000, 20000, 25000]);
  expect(samples[0]).toMatchObject({ xQ8: 200 * 256, yQ8: 200 * 256 });
  expect(samples[3]).toMatchObject({ event: 'click', relatedObservationSeq: 2 });
  expect(samples).toHaveLength(4);
});

it('finalizes a confirmed pause-stop without inventing resume or a stop position', async () => {
  const { writer, records } = await setup();
  await writer.append(
    packet([sample(0, 10000, 100), { kind: 'boundary', activeTimeUs: 20000, reason: 'pause' }]),
    'native-doc'
  );
  expect((await writer.finish({ stoppedWhilePaused: true })).state).toBe('complete');
  const all = await records();
  expect(all.filter((record) => record.kind === 'sample')).toHaveLength(1);
  expect(all.at(-1)).toMatchObject({ kind: 'boundary', reason: 'pause' });
  expect(all.filter((record) => record.kind === 'segment')).toHaveLength(1);
});

it('preserves an input-overflow gap and reserves its lost source identities', async () => {
  const { writer, records } = await setup();
  await writer.append(
    packet([
      sample(0, 0, 10),
      {
        kind: 'gap',
        fromTimeUs: 10000,
        toTimeUs: 20000,
        firstLostLocalSequence: 1,
        lastLostLocalSequence: 2,
        reason: 'input-overflow',
      },
      sample(3, 30000, 20),
      { kind: 'boundary', activeTimeUs: 40000, reason: 'stop' },
    ]),
    'native-doc'
  );
  expect((await writer.finish()).state).toBe('incomplete');
  const all = await records();
  expect(all.find((record) => record.kind === 'gap')).toMatchObject({
    firstLostObservationSeq: 1,
    lastLostObservationSeq: 2,
    fromTimeUs: 10000,
    toTimeUs: 20000,
  });
  expect(
    all.filter((record) => record.kind === 'sample').map((point) => point.observationSeq)
  ).toEqual([0, 3]);
});

it('does not fabricate coordinates when geometry becomes unavailable', async () => {
  const { writer, records } = await setup(() => null);
  await writer.append(
    packet([sample(0, 0, 100), { kind: 'boundary', activeTimeUs: 10000, reason: 'stop' }]),
    'native-doc'
  );
  expect((await writer.finish()).state).toBe('incomplete');
  const point = (await records()).find((value) => value.kind === 'sample');
  expect(point).toMatchObject({ observed: false, xQ8: null, yQ8: null });
});

it('admits exact retry without adding another source observation', async () => {
  const { writer, records } = await setup();
  const value = packet([
    sample(0, 1000, 10),
    { kind: 'boundary', activeTimeUs: 2000, reason: 'stop' },
  ]);
  await writer.append(value, 'native-doc');
  await writer.append(value, 'native-doc');
  await writer.finish();
  expect((await records()).filter((record) => record.kind === 'sample')).toHaveLength(1);
});

it.each([false, true])(
  'accepts the final source drain while media stop waits for it; paused=%s',
  async (stoppedWhilePaused) => {
    const { writer } = await setup();
    await writer.append(packet([sample(0, 1000, 10)]), 'native-doc');
    const finishing = writer.finish({ waitForSourceStop: true, stoppedWhilePaused });
    await writer.append(
      packet([{ kind: 'boundary', activeTimeUs: 2000, reason: 'stop' }], 1),
      'native-doc'
    );
    expect((await finishing).state).toBe('complete');
  }
);

it('refuses excess pending packets without changing the accepted stream', async () => {
  const { writer } = await setup();
  const first = writer.append(packet([sample(0, 1000, 10)]), 'native-doc');
  const second = writer.append(packet([sample(1, 2000, 20)], 1), 'native-doc');
  await expect(writer.append(packet([sample(2, 3000, 30)], 2), 'native-doc')).rejects.toThrow(
    'BACKPRESSURE'
  );
  await Promise.all([first, second]);
  await writer.append(
    packet([sample(2, 3000, 30), { kind: 'boundary', activeTimeUs: 4000, reason: 'stop' }], 2),
    'native-doc'
  );
  expect((await writer.finish()).state).toBe('complete');
});

it('preserves the committed prefix after a writer failure', async () => {
  const { store, writer, records } = await setup();
  await writer.append(
    packet([sample(0, 1000, 10), { kind: 'boundary', activeTimeUs: 2000, reason: 'pause' }]),
    'native-doc'
  );
  const append = store.append;
  vi.spyOn(store, 'append').mockImplementation(async (lease, block) => {
    if (block.entry.sequence > 0)
      throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
    await append(lease, block);
  });
  await expect(
    writer.append(
      packet([sample(1, 3000, 20), { kind: 'boundary', activeTimeUs: 4000, reason: 'stop' }], 1),
      'native-doc'
    )
  ).rejects.toThrow();
  const result = await writer.finish();
  expect(result).toMatchObject({ state: 'incomplete', totalBlocks: 1, totalSamples: 1 });
  expect((await records()).filter((record) => record.kind === 'sample')).toHaveLength(1);
});

it('retries finalization after a temporary refusal without changing blocks', async () => {
  const { store, writer } = await setup();
  await writer.append(
    packet([sample(0, 1000, 10), { kind: 'boundary', activeTimeUs: 2000, reason: 'stop' }]),
    'native-doc'
  );
  vi.spyOn(store, 'finalize').mockRejectedValueOnce(
    new DOMException('Synthetic write refusal', 'QuotaExceededError')
  );
  await expect(writer.finish()).rejects.toThrow();
  expect((await writer.finish()).state).toBe('complete');
});

it('rejects malformed or unrelated packets before the valid source is affected', async () => {
  const { writer } = await setup();
  const value = packet([
    sample(0, 1000, 10),
    { kind: 'boundary', activeTimeUs: 2000, reason: 'stop' },
  ]);
  await expect(
    writer.append({ ...value, url: 'https://private.test/' }, 'native-doc')
  ).rejects.toThrow('INVALID_INPUT');
  await expect(writer.append({ ...value, recordingId: 'other' }, 'native-doc')).rejects.toThrow(
    'INVALID_INPUT'
  );
  await writer.append(value, 'native-doc');
  expect((await writer.finish()).state).toBe('complete');
});
