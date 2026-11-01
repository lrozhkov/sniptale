import { createRecordingEventSource } from '../../../../apps/extension/src/content/overlay/video-telemetry/event-source';
import '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../../apps/extension/src/features/video/project/recording-events/fixtures.json';
import { isRecordingEventRecord } from '../../../../apps/extension/src/features/video/project/recording-events/records';
import type { RecordingEventRecord } from '../../../../apps/extension/src/features/video/project/recording-events/types';
import type { RecordingPointTransform } from '../../../../apps/extension/src/features/video/project/types';
import { createRecordingEventsStore } from '../../../../apps/extension/src/composition/persistence/recordings/recording-events/store';
import { installPersistenceLockManagerForTests } from '../../../../apps/extension/src/composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { createBrowserRecordingEventsWriter } from '../../../../apps/extension/src/offscreen/recording/recording-events/writer';

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
  return { db, identity, writer };
}
it('streams 5000 browser facts through the source queue into durable blocks', async () => {
  const { writer, db, identity } = await setup();
  const producer = createRecordingEventSource({
    recordingId: identity.recordingId,
    project: (moment) => ({
      activeTimeUs: Math.round(moment.observationTimeSeconds * 1000000),
      clockRevision: 1,
      clock,
    }),
    send: (input) => writer.append(input, 'document'),
  });
  const moment = (seconds: number) => ({
    sourceClockId: 'phase',
    observationTimeSeconds: seconds,
    viewport,
  });
  producer.open(moment(0));
  for (let i = 0; i < 5000; i++) {
    const input = click(`streamed-${i}`, 0, i * 1000);
    if (input.kind !== 'action') throw new Error('Missing action.');
    expect(producer.emit(moment(i / 1000), { kind: 'action', action: input.action })).toBe(true);
    if (i % 32 === 31) expect(await producer.flush()).toBe(true);
  }
  producer.boundary(moment(6), 'stop');
  producer.close();
  expect(await producer.flush()).toBe(true);
  expect(await writer.finish()).toMatchObject({ state: 'complete', totalRecords: 5002 });
  expect(await db.countFromIndex('recording_events', 'kind', 'fact')).toBe(5000);
}, 15000);
