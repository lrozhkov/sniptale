import { expect, it, vi } from 'vitest';
import { createRecordingHistoryIntake } from './history-intake';
import {
  isFinalRecordingCursorPackets,
  isRecordingCursorObservationPacket,
  type RecordingCursorObservationPacket,
} from '../../contracts/video/cursor-observations';
const packet = (batchSequence: number): RecordingCursorObservationPacket => ({
  version: 1,
  recordingId: 'recording',
  sourceClockId: 'clock',
  sourceInstanceId: 'producer',
  batchSequence,
  clockRevision: 0,
  clock: {
    source: 'dom-event-time',
    timestampQuantumUs: null,
    resolutionBoundUs: null,
    mappingUncertaintyUs: null,
  },
  viewport: {
    width: 640,
    height: 400,
    devicePixelRatio: 1,
    visualViewportScale: 1,
    visualViewportOffsetX: 0,
    visualViewportOffsetY: 0,
  },
  records: [{ kind: 'boundary', reason: 'observation', activeTimeUs: batchSequence }],
});
const setup = (process = vi.fn(async () => {})) => ({
  process,
  intake: createRecordingHistoryIntake<RecordingCursorObservationPacket, string>({
    recordingId: 'recording',
    errorPrefix: 'HISTORY',
    isPacket: isRecordingCursorObservationPacket,
    isFinalBatch: isFinalRecordingCursorPackets,
    process,
  }),
});
it('coalesces pending final batches and acknowledges exact full and late scalar retries', async () => {
  const gate = Promise.withResolvers<void>();
  const process = vi.fn(async () => {
    await gate.promise;
  });
  const { intake } = setup(process);
  const batch = [packet(0), packet(1)];
  const first = intake.appendFinal(batch, 'doc');
  expect(intake.appendFinal(batch, 'doc')).toBe(first);
  gate.resolve();
  await first;
  await intake.appendFinal(batch, 'doc');
  await intake.append(packet(0), 'doc');
  expect(process).toHaveBeenCalledTimes(2);
  await expect(
    intake.appendFinal([packet(0), { ...packet(1), clockRevision: 1 }], 'doc')
  ).rejects.toThrow('CONFLICT');
});
it('serializes an older scalar packet before its closing batch', async () => {
  const gate = Promise.withResolvers<void>();
  const process = vi.fn(async () => {
    await gate.promise;
  });
  const { intake } = setup(process);
  const first = intake.append(packet(0), 'doc');
  const final = intake.appendFinal([packet(0), packet(1)], 'doc');
  gate.resolve();
  await Promise.all([first, final]);
  expect(process.mock.calls.map((args) => args.length)).toHaveLength(3);
  await intake.append(packet(0), 'doc');
  expect(process).toHaveBeenCalledTimes(3);
});
it('does not retain receipts across closure or adopt them into a recreated writer', async () => {
  const { intake } = setup();
  await intake.appendFinal([packet(0)], 'doc');
  await intake.closeAndDrain();
  await expect(intake.appendFinal([packet(0)], 'doc')).rejects.toThrow('CLOSED');
  await expect(intake.append(packet(0), 'doc')).rejects.toThrow('CLOSED');
  const next = setup();
  await next.intake.appendFinal([packet(0)], 'doc');
  expect(next.process).toHaveBeenCalledOnce();
});
it('keeps the pending receipt when earlier queued work belongs to the predecessor', async () => {
  const gate = Promise.withResolvers<void>();
  const process = vi.fn(async () => {
    await gate.promise;
  });
  const { intake } = setup(process);
  const old = intake.append(packet(0), 'old');
  const next = intake.appendFinal([packet(0)], 'new');
  gate.resolve();
  await Promise.all([old, next]);
  await intake.appendFinal([packet(0)], 'new');
  expect(process).toHaveBeenCalledTimes(2);
});
it('retains honest failure and rejects malformed or conflicting late retries', async () => {
  const { intake } = setup();
  await expect(intake.appendFinal([], 'doc')).rejects.toThrow('INVALID_INPUT');
  await intake.appendFinal([packet(0)], 'doc');
  await expect(intake.append({ ...packet(0), clockRevision: 1 }, 'doc')).rejects.toThrow(
    'CONFLICT'
  );
  expect(intake.failed).toBe(true);
});

it('refuses a queued retired source without poisoning intake or replacing the current receipt', async () => {
  const { intake, process } = setup();
  await intake.append(packet(0), 'A');
  const next = intake.appendFinal([{ ...packet(0), sourceClockId: 'B-clock' }], 'B');
  const stale = expect(intake.appendFinal([packet(1)], 'A')).rejects.toThrow('SOURCE_UNAVAILABLE');
  await Promise.all([next, stale]);
  expect(intake.failed).toBe(false);
  await intake.appendFinal([{ ...packet(0), sourceClockId: 'B-clock' }], 'B');
  expect(process).toHaveBeenCalledTimes(2);
  await expect(intake.append(packet(0), 'A')).rejects.toThrow('SOURCE_UNAVAILABLE');
  await intake.appendFinal(
    [{ ...packet(0), sourceClockId: 'fresh-A', sourceInstanceId: 'fresh-A' }],
    'A'
  );
  expect(intake.failed).toBe(false);
  expect(process).toHaveBeenCalledTimes(3);
});

it('bounds canonical retirement without eviction while preserving the admitted source receipt', async () => {
  const { intake, process } = setup();
  for (let index = 0; index <= 4096; index++) {
    await intake.appendFinal(
      [{ ...packet(0), sourceClockId: `source-${index}`, sourceInstanceId: `source-${index}` }],
      'document'
    );
  }
  await expect(
    intake.appendFinal(
      [{ ...packet(0), sourceClockId: 'overflow', sourceInstanceId: 'overflow' }],
      'document'
    )
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  await expect(
    intake.appendFinal(
      [{ ...packet(0), sourceClockId: 'source-0', sourceInstanceId: 'source-0' }],
      'document'
    )
  ).rejects.toThrow('SOURCE_UNAVAILABLE');
  await intake.appendFinal(
    [{ ...packet(0), sourceClockId: 'source-4096', sourceInstanceId: 'source-4096' }],
    'document'
  );
  expect(process).toHaveBeenCalledTimes(4097);
  expect(intake.failed).toBe(false);
});
