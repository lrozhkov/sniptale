import { expect, it, vi } from 'vitest';
import fixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventRecord } from '../../../features/video/project/recording-events/records';
import {
  isRecordingEventObservationPacket,
  type RecordingEventObservationPacket,
} from '../../../contracts/video/event-observations';
import { createRecordingEventSource, type RecordingEventSourceFact } from './event-source';

const records = fixture.blocks
  .flatMap<unknown>((block) => block.value.records)
  .map((record) => {
    if (!isRecordingEventRecord(record)) throw new Error('Invalid source fixture.');
    return record;
  });
function moment(seconds = 0) {
  return {
    sourceClockId: 'phase-1',
    observationTimeSeconds: seconds,
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      visualViewportScale: 1,
      visualViewportOffsetX: 0,
      visualViewportOffsetY: 0,
    },
  };
}
function click(id: string, timeUs = 0): RecordingEventSourceFact {
  const source = records.find(
    (record) => record.kind === 'action' && record.action.kind === 'CLICK'
  );
  if (!source || source.kind !== 'action' || source.action.kind !== 'CLICK')
    throw new Error('Missing click.');
  return {
    kind: 'action',
    action: {
      ...structuredClone(source.action),
      id,
      timeUs,
      data: { ...source.action.data, lastObservedTimeUs: timeUs },
    },
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const packets: RecordingEventObservationPacket[] = [];
  let offsetUs = 0;
  const send = vi.fn(async (packet: RecordingEventObservationPacket) => {
    packets.push(structuredClone(packet));
  });
  const project = vi.fn((input: ReturnType<typeof moment>) => ({
    activeTimeUs: Math.round(input.observationTimeSeconds * 1000000) + offsetUs,
    clockRevision: 1,
    clock: {
      source: 'dom-event-time' as const,
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: 10,
    },
  }));
  const source = createRecordingEventSource({ recordingId: 'recording', send, project });
  return {
    source,
    send,
    project,
    packets,
    offset(value: number) {
      offsetUs = value;
    },
  };
}

it('waits for initial calibration and snapshots caller facts before asynchronous projection', async () => {
  const { source, packets, offset, project } = setup();
  source.open(moment());
  const calibration = deferred();
  source.waitForCalibration(calibration.promise);
  const input = moment(0.000123);
  const fact = click('original', 123);
  source.emit(input, fact);
  input.viewport.width = 500;
  if (fact.kind === 'action') fact.action.id = 'changed-after-emit';
  await Promise.resolve();
  expect(project).not.toHaveBeenCalled();
  offset(17);
  calibration.resolve();
  expect(await source.flush()).toBe(true);
  expect(packets).toHaveLength(1);
  expect(packets[0]?.records[1]).toMatchObject({
    activeTimeUs: 140,
    action: { id: 'original', timeUs: 140 },
  });
  expect(packets[0]?.viewport.width).toBe(1280);
});

it('retries exactly the same packet before newer facts after transport refusal', async () => {
  const { source, send, packets } = setup();
  const attempts: string[] = [];
  send.mockImplementationOnce(async (packet) => {
    attempts.push(JSON.stringify(packet));
    packet.records[0]!.activeTimeUs = 999;
    throw new Error('Transport refused.');
  });
  send.mockImplementation(async (packet) => {
    attempts.push(JSON.stringify(packet));
    packets.push(structuredClone(packet));
  });
  source.open(moment());
  source.emit(moment(0.1), click('first', 100000));
  expect(await source.flush()).toBe(false);
  source.emit(moment(0.2), click('newer', 200000));
  expect(await source.flush()).toBe(true);
  expect(attempts[1]).toBe(attempts[0]);
  expect(packets.map((packet) => packet.batchSequence)).toEqual([0, 1]);
  expect(packets.flatMap((packet) => packet.records).map((record) => record.recordSeq)).toEqual([
    0, 1, 2,
  ]);
});

it('retains more than 4096 facts through incremental bounded packets without decimating old history', async () => {
  const { source, packets } = setup();
  source.open(moment());
  for (let i = 0; i < 5000; i++) {
    expect(source.emit(moment(i / 1000), click(`click-${i}`, i * 1000))).toBe(true);
    if (i % 32 === 31) expect(await source.flush()).toBe(true);
  }
  source.boundary(moment(6), 'stop');
  source.close();
  expect(await source.flush()).toBe(true);
  const all = packets.flatMap((packet) => packet.records);
  expect(all).toHaveLength(5002);
  expect(
    all.filter((record) => record.kind === 'action').map((record) => record.action.id)
  ).toEqual(Array.from({ length: 5000 }, (_, index) => `click-${index}`));
  expect(all.map((record) => record.recordSeq)).toEqual(
    Array.from({ length: all.length }, (_, index) => index)
  );
  expect(packets.every(isRecordingEventObservationPacket)).toBe(true);
});

it('splits by UTF-8 byte budget independently of the record count', async () => {
  const { source, packets } = setup();
  const calibration = deferred();
  source.waitForCalibration(calibration.promise);
  source.open(moment());
  for (let i = 0; i < 64; i++)
    source.emit(moment(511000000), {
      kind: 'keyboard-repeat-block',
      ownerKind: 'action',
      ownerId: 'key-1',
      phase: 'repeat',
      cadence: {
        version: 1,
        id: `large-cadence-${i}`,
        startTimeUs: 0,
        quantumUs: 1,
        count: 512,
        encoding: 'delta-us',
        ticks: [0, ...Array.from({ length: 511 }, () => 1000000000000)],
      },
    });
  calibration.resolve();
  expect(await source.flush()).toBe(true);
  expect(packets.length).toBeGreaterThan(2);
  expect(
    packets
      .flatMap((packet) => packet.records)
      .filter((record) => record.kind === 'keyboard-repeat-block')
  ).toHaveLength(64);
  for (const packet of packets) {
    expect(packet.records.length).toBeLessThanOrEqual(64);
    expect(new TextEncoder().encode(JSON.stringify(packet)).byteLength).toBeLessThanOrEqual(65536);
  }
});

it('preserves the accepted prefix and emits an explicit terminal gap on source overflow', async () => {
  const { source, packets } = setup();
  const calibration = deferred();
  source.waitForCalibration(calibration.promise);
  source.open(moment());
  let accepted = 0;
  for (let i = 0; i < 600; i++)
    if (source.emit(moment(i / 1000), click(`click-${i}`, i * 1000))) accepted++;
  expect(source.failed).toBe(true);
  expect(source.pendingCount).toBeLessThanOrEqual(514);
  source.boundary(moment(1), 'stop');
  source.close();
  calibration.resolve();
  expect(await source.flush()).toBe(true);
  const all = packets.flatMap((packet) => packet.records);
  expect(
    all.filter((record) => record.kind === 'action').map((record) => record.action.id)
  ).toEqual(Array.from({ length: accepted }, (_, i) => `click-${i}`));
  expect(all.filter((record) => record.kind === 'gap')).toMatchObject([
    { reason: 'input-overflow', lostCount: null, toTimeUs: null },
  ]);
  expect(all.at(-1)).toMatchObject({ kind: 'boundary', reason: 'stop' });
  expect(all.map((record) => record.recordSeq)).toEqual(
    Array.from({ length: all.length }, (_, i) => i)
  );
});

it('aggregates protected input before numbering and keeps payload and envelope times coarse', async () => {
  const { source, packets, offset } = setup();
  offset(123456);
  source.open(moment());
  for (let i = 0; i < 200; i++)
    source.emit(moment(1.234567 + i / 1000000), {
      kind: 'signal',
      signal: {
        id: `protected-${i}`,
        kind: 'typing',
        startTimeUs: 1000000,
        endTimeUs: 2000000,
        point: null,
        data: {
          eventCount: null,
          activity: 'input',
          privacy: 'protected',
          groupId: null,
          continuationOf: null,
        },
      },
    });
  source.boundary(moment(2.5), 'stop');
  source.close();
  expect(await source.flush()).toBe(true);
  const all = packets.flatMap((packet) => packet.records);
  expect(all).toHaveLength(3);
  expect(all.map((record) => record.recordSeq)).toEqual([0, 1, 2]);
  const activity = all[1]!;
  expect(activity).toMatchObject({
    kind: 'signal',
    activeTimeUs: 1000000,
    signal: { startTimeUs: 1000000, endTimeUs: 3000000, point: null, data: { eventCount: null } },
  });
});

it('confirms Stop during Pause without opening another source segment', async () => {
  const { source, packets } = setup();
  source.open(moment());
  source.boundary(moment(1), 'pause');
  expect(await source.flush()).toBe(true);
  source.boundary(moment(1), 'stop');
  source.close();
  expect(await source.flush()).toBe(true);
  const all = packets.flatMap((packet) => packet.records);
  expect(all.filter((record) => record.kind === 'segment')).toHaveLength(1);
  expect(all.filter((record) => record.kind === 'boundary').map((record) => record.reason)).toEqual(
    ['pause', 'stop']
  );
});

it('does not forward unsafe source labels and preserves earlier accepted facts', async () => {
  const { source, packets } = setup();
  const key = records.find((record) => record.kind === 'action' && record.action.kind === 'KEY');
  if (!key || key.kind !== 'action') throw new Error('Missing key source.');
  source.open(moment());
  source.emit(moment(0.1), click('accepted', 100000));
  expect(
    source.emit(moment(0.2), { kind: 'action', action: { ...key.action, label: 'typed-secret' } })
  ).toBe(false);
  expect(await source.flush()).toBe(true);
  const all = packets.flatMap((packet) => packet.records);
  expect(all.some((record) => record.kind === 'action' && record.action.id === 'accepted')).toBe(
    true
  );
  expect(all.some((record) => record.kind === 'gap' && record.reason === 'unknown-record')).toBe(
    true
  );
  expect(JSON.stringify(packets)).not.toContain('typed-secret');
});

it('projects anonymous hold edges together and retains unknown onset without fake duration', async () => {
  const { source, packets, offset } = setup();
  offset(17);
  source.open(moment(0));
  for (const downTimeUs of [2000000, null]) {
    source.emit(moment(9), {
      kind: 'signal',
      signal: {
        id: downTimeUs === null ? 'unknown-onset' : 'known-onset',
        kind: 'keyboard-hold',
        startTimeUs: 2000000,
        endTimeUs: 3200000,
        point: null,
        data: {
          privacy: 'normal',
          downTimeUs,
          upTimeUs: 3200000,
          pressDurationUs: downTimeUs === null ? null : 1200000,
          lastObservedTimeUs: 3200000,
          repeatCount: 70000,
          completion: 'released',
        },
      },
    });
  }
  source.boundary(moment(9), 'stop');
  expect(await source.flush()).toBe(true);
  const holds = packets
    .flatMap((packet) => packet.records)
    .filter((record) => record.kind === 'signal');
  expect(holds).toHaveLength(2);
  expect(holds[0]).toMatchObject({
    activeTimeUs: 9000017,
    signal: {
      startTimeUs: 2000017,
      endTimeUs: 3200017,
      data: {
        downTimeUs: 2000017,
        upTimeUs: 3200017,
        lastObservedTimeUs: 3200017,
        pressDurationUs: 1200000,
        repeatCount: 70000,
      },
    },
  });
  expect(holds[1]).toMatchObject({
    signal: { data: { downTimeUs: null, upTimeUs: 3200017, pressDurationUs: null } },
  });
  expect(packets.every(isRecordingEventObservationPacket)).toBe(true);
});

it('preserves facts after an explicitly unknown source onset without manufacturing a lost count', async () => {
  const { source, packets } = setup();
  source.open(moment());
  expect(source.contextGap(moment(2), 'keyboard', 'source-unavailable')).toBe(true);
  expect(source.emit(moment(3), click('after-unknown-onset', 3000000))).toBe(true);
  source.boundary(moment(4), 'stop');
  expect(await source.flush()).toBe(true);
  expect(source.failed).toBe(false);
  const records = packets.flatMap((packet) => packet.records);
  expect(records.map((record) => record.kind)).toEqual([
    'segment',
    'gap',
    'segment',
    'action',
    'boundary',
  ]);
  expect(records[1]).toMatchObject({
    segmentId: 0,
    source: 'keyboard',
    lostCount: null,
    firstLostSourceSeq: null,
    lastLostSourceSeq: null,
    toTimeUs: 2000000,
  });
  expect(records[2]).toMatchObject({ segmentId: 1, reason: 'after-gap' });
});
