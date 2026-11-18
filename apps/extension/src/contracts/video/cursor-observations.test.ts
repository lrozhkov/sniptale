import { expect, it } from 'vitest';
import {
  isFinalRecordingCursorPackets,
  isRecordingCursorObservationPacket,
  type RecordingCursorObservationPacket,
} from './cursor-observations';
import { isCursorTrajectoryDescriptor } from '../../features/video/project/cursor-trajectory/records';

function packet(): RecordingCursorObservationPacket {
  return {
    version: 1,
    recordingId: 'recording-1',
    batchSequence: 0,
    sourceClockId: 'clock-1',
    clockRevision: 1,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
    viewport: {
      width: 640,
      height: 400,
      devicePixelRatio: 2,
      visualViewportScale: 1,
      visualViewportOffsetX: 0,
      visualViewportOffsetY: 0,
    },
    records: [
      {
        kind: 'sample',
        localSequence: 0,
        activeTimeUs: 12345,
        x: 40.25,
        y: 50.5,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedLocalSequence: null,
      },
    ],
  };
}

it('admits source timestamps and fractional client coordinates with unknown clock precision', () => {
  expect(isRecordingCursorObservationPacket(packet())).toBe(true);
  expect(
    isRecordingCursorObservationPacket({
      ...packet(),
      records: Array.from({ length: 64 }, () => packet().records[0]!),
    })
  ).toBe(true);
});

it('rejects private fields, excess records, invalid numbers and false clock precision', () => {
  expect(isRecordingCursorObservationPacket({ ...packet(), url: 'https://private.test/' })).toBe(
    false
  );
  expect(
    isRecordingCursorObservationPacket({
      ...packet(),
      records: Array.from({ length: 65 }, () => packet().records[0]!),
    })
  ).toBe(false);
  for (const patch of [
    { text: 'private' },
    { x: NaN },
    { activeTimeUs: -1 },
    { localSequence: 0.5 },
    { observed: false },
  ]) {
    const value = packet();
    Object.assign(value.records[0]!, patch);
    expect(isRecordingCursorObservationPacket(value)).toBe(false);
  }
  expect(
    isRecordingCursorObservationPacket({
      ...packet(),
      clock: { ...packet().clock, timestampQuantumUs: 0 },
    })
  ).toBe(false);
  expect(
    isRecordingCursorObservationPacket({
      ...packet(),
      clock: { ...packet().clock, source: 'windows-message-time' },
    })
  ).toBe(false);
});

it('accepts unobserved samples, related clicks and gaps within the shared packet envelope', () => {
  const value = packet();
  const point = value.records[0];
  const unobserved = { ...point, observed: false, visible: false, x: null, y: null };
  const click = {
    ...point,
    localSequence: 1,
    event: 'click',
    button: 'left',
    relatedLocalSequence: 0,
  };
  const openGap = {
    kind: 'gap',
    fromTimeUs: 12346,
    toTimeUs: null,
    firstLostLocalSequence: null,
    lastLostLocalSequence: null,
    reason: 'source-unavailable',
  };
  const boundedGap = {
    ...openGap,
    toTimeUs: 12347,
    firstLostLocalSequence: 2,
    lastLostLocalSequence: 4,
    reason: 'input-overflow',
  };
  const records = [unobserved, click, openGap, boundedGap];
  expect(isRecordingCursorObservationPacket({ ...value, records })).toBe(true);
  expect(isRecordingCursorObservationPacket({ ...value, records: [] })).toBe(false);

  for (const invalid of [
    null,
    { kind: 'recording' },
    { ...unobserved, y: 10 },
    { ...click, relatedLocalSequence: 1 },
    { ...click, event: 'move' },
    { ...openGap, fromTimeUs: -1 },
    { ...boundedGap, toTimeUs: 12345 },
    { ...boundedGap, lastLostLocalSequence: 1 },
    { ...boundedGap, reason: 'other' },
  ]) {
    expect(isRecordingCursorObservationPacket({ ...value, records: [invalid] })).toBe(false);
  }
});

it('accepts closed incomplete descriptors but refuses an unfinished unavailable claim', () => {
  const descriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: 'a'.repeat(32),
    state: 'incomplete',
    finalized: false,
    totalBlocks: 1,
    totalRecords: 3,
    totalSamples: 1,
    totalBytes: 650,
    streamSha256: 'b'.repeat(64),
  };
  expect(isCursorTrajectoryDescriptor(descriptor)).toBe(true);
  expect(isCursorTrajectoryDescriptor({ ...descriptor, password: 'private' })).toBe(false);
  expect(isCursorTrajectoryDescriptor({ ...descriptor, state: 'unavailable' })).toBe(false);
});

it('checks final packet identity, sequence, closed tail, and whole-batch bounds', () => {
  const first = packet();
  const last: RecordingCursorObservationPacket = {
    ...packet(),
    batchSequence: 1,
    records: [{ kind: 'boundary', activeTimeUs: 12345, reason: 'observation' }],
  };
  expect(isFinalRecordingCursorPackets([first, last])).toBe(true);
  const phased = [
    { ...first, sourceInstanceId: 'producer' },
    { ...last, sourceInstanceId: 'producer', sourceClockId: 'resume-phase' },
  ];
  expect(isFinalRecordingCursorPackets(phased)).toBe(true);
  expect(
    isFinalRecordingCursorPackets([phased[0], { ...phased[1], sourceInstanceId: 'other' }])
  ).toBe(false);
  expect(isRecordingCursorObservationPacket({ ...first, sourceInstanceId: '' })).toBe(false);
  expect(isRecordingCursorObservationPacket({ ...first, sourceInstanceId: 3 })).toBe(false);
  expect(isFinalRecordingCursorPackets([])).toBe(false);
  expect(isFinalRecordingCursorPackets([first])).toBe(false);
  expect(isFinalRecordingCursorPackets([first, { ...last, recordingId: 'foreign' }])).toBe(false);
  expect(isFinalRecordingCursorPackets([first, { ...last, sourceClockId: 'other' }])).toBe(false);
  expect(isFinalRecordingCursorPackets([first, { ...last, batchSequence: 3 }])).toBe(false);
  expect(
    isFinalRecordingCursorPackets(
      Array.from({ length: 600 }, (_, i) => ({ ...last, batchSequence: i }))
    )
  ).toBe(false);
});
