import { expect, it } from 'vitest';
import {
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
