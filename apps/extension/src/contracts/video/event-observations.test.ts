import { expect, it } from 'vitest';
import fixture from '../../features/video/project/recording-events/fixtures.json';
import {
  isRecordingEventObservationPacket,
  type RecordingEventObservationPacket,
} from './event-observations';
import { isRecordingEventRecord } from '../../features/video/project/recording-events/records';
import type { RecordingEventRecord } from '../../features/video/project/recording-events/types';

function packet(): RecordingEventObservationPacket {
  const clock = {
    source: 'dom-event-time',
    timestampQuantumUs: null,
    resolutionBoundUs: null,
    mappingUncertaintyUs: null,
  };
  const source = {
    version: 1,
    recordingId: 'recording',
    batchSequence: 0,
    sourceClockId: 'document-phase',
    clockRevision: 1,
    clock,
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      visualViewportScale: 1,
      visualViewportOffsetX: 0,
      visualViewportOffsetY: 0,
    },
    records: [
      { ...fixture.blocks[0]!.value.records[0]!, clock },
      ...fixture.blocks[0]!.value.records.slice(1),
    ],
  };
  if (!isRecordingEventObservationPacket(source)) throw new Error('Invalid source fixture.');
  return source;
}
it('admits closed source facts and preserves delayed timestamps without imposing an archive sequence', () => {
  const source = packet();
  expect(isRecordingEventObservationPacket(source)).toBe(true);
  const delayed = structuredClone(fixture.blocks[2]!.value.records);
  source.records = delayed.map((record) => {
    const candidate = record.kind === 'segment' ? { ...record, clock: source.clock } : record;
    if (!isRecordingEventRecord(candidate)) throw new Error('Invalid source record.');
    return candidate;
  });
  expect(isRecordingEventObservationPacket(source)).toBe(true);
  // Missing input uses an explicit gap payload. Emission record numbering stays contiguous.
  source.records = [source.records[0]!, { ...source.records[1]!, recordSeq: 30 }];
  expect(isRecordingEventObservationPacket(source)).toBe(false);
});
it.each([
  'header-extra',
  'record-extra',
  'unsafe-time',
  'unsafe-label',
  'duplicate-order',
  'wrong-clock',
  'wrong-geometry',
  'private-epoch',
  'record-budget',
] as const)('refuses %s before forwarding', (failure) => {
  const source = packet();
  let candidate: unknown = source;
  if (failure === 'header-extra') candidate = { ...source, nativeDocumentId: 'claimed-document' };
  if (failure === 'record-extra')
    candidate = {
      ...source,
      records: [
        { ...source.records[0]!, privateField: 'target-value' },
        ...source.records.slice(1),
      ],
    };
  if (failure === 'unsafe-time')
    source.records[0] = { ...source.records[0]!, activeTimeUs: Number.MAX_SAFE_INTEGER + 1 };
  if (failure === 'unsafe-label') {
    const action = source.records[1]!;
    if (!('action' in action)) throw new Error('Missing source action.');
    source.records[1] = { ...action, action: { ...action.action, label: 'typed secret' } };
  }
  if (failure === 'duplicate-order') source.records[1] = { ...source.records[1]!, recordSeq: 0 };
  if (failure === 'wrong-clock')
    candidate = { ...source, clock: { ...source.clock, source: 'native-input' } };
  if (failure === 'wrong-geometry')
    candidate = { ...source, viewport: { ...source.viewport, width: 0 } };
  if (failure === 'private-epoch')
    candidate = { ...source, clock: { ...source.clock, timeOriginMs: 12345 } };
  if (failure === 'record-budget')
    source.records = Array.from({ length: 65 }, (_, recordSeq) => ({
      ...source.records[1]!,
      recordSeq,
    }));
  expect(isRecordingEventObservationPacket(candidate)).toBe(false);
});
it('bounds serialized bytes independently of record count', () => {
  const source = packet();
  const cadence = fixture.blocks[0]!.value.records.find(
    (record) => record.kind === 'keyboard-repeat-block'
  );
  if (!isRecordingEventRecord(cadence) || cadence.kind !== 'keyboard-repeat-block')
    throw new Error('Missing cadence fixture.');
  const huge: RecordingEventRecord = {
    ...cadence,
    cadence: {
      ...cadence.cadence,
      startTimeUs: 0,
      count: 512,
      encoding: 'delta-us',
      ticks: [0, ...Array.from({ length: 511 }, () => 1000000000000)],
    },
  };
  source.records = Array.from({ length: 64 }, (_, recordSeq) => ({ ...huge, recordSeq }));
  expect(isRecordingEventObservationPacket(source)).toBe(false);
  source.records = source.records.slice(0, 1);
  expect(isRecordingEventObservationPacket(source)).toBe(true);
});
