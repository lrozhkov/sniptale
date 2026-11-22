import { expect, it } from 'vitest';
import {
  isFinalObservationBatch,
  RECORDING_OBSERVATION_FINAL_MAX_BYTES,
} from './observation-batches';
interface Packet {
  recordingId: string;
  sourceClockId: string;
  batchSequence: number;
  records: { kind: string }[];
  payload: string;
}
const packet = (payload: string): Packet => ({
  recordingId: 'r',
  sourceClockId: 'clock',
  batchSequence: 0,
  records: [{ kind: 'boundary' }],
  payload,
});
const checked = (value: unknown): value is Packet =>
  typeof value === 'object' &&
  value !== null &&
  'payload' in value &&
  typeof value.payload === 'string' &&
  'recordingId' in value &&
  typeof value.recordingId === 'string' &&
  'sourceClockId' in value &&
  typeof value.sourceClockId === 'string' &&
  'batchSequence' in value &&
  typeof value.batchSequence === 'number' &&
  'records' in value &&
  Array.isArray(value.records) &&
  value.records.every(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      'kind' in record &&
      typeof record.kind === 'string'
  );

it('refuses expanded batch bytes before native transport admission', () => {
  expect(isFinalObservationBatch([packet('ok')], checked, 578)).toBe(true);
  expect(
    isFinalObservationBatch(
      [packet('x'.repeat(RECORDING_OBSERVATION_FINAL_MAX_BYTES))],
      checked,
      578
    )
  ).toBe(false);
  expect(isFinalObservationBatch(Array(2), checked, 578)).toBe(false);
});
