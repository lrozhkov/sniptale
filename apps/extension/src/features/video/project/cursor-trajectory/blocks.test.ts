import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import fixtures from './fixtures.json';
import { createCursorTrajectoryBlockPacker, decodeCursorTrajectoryBlock } from './blocks';
import { isCursorTrajectoryRecord } from './records';
import { createCursorTrajectoryWindowRecorder, simplifyCursorTrajectoryWindow } from './simplify';
import type {
  CursorTrajectoryRecord,
  CursorTrajectorySample,
  CursorTrajectorySegment,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function checkedRecord(value: unknown): CursorTrajectoryRecord {
  if (!isCursorTrajectoryRecord(value)) throw new Error('Invalid shared fixture record.');
  return value;
}

function* generatedRecords(
  generator: {
    observationCount: number;
    stepUs: number;
    xQ8: number;
    baseYQ8: number;
    oddYOffsetQ8: number;
    clockQuantumUs: number;
  },
  simplify: boolean
): Generator<CursorTrajectoryRecord> {
  yield {
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    width: 1280,
    height: 800,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: generator.clockQuantumUs,
      resolutionBoundUs: generator.clockQuantumUs,
      mappingUncertaintyUs: 0,
    },
    reason: 'start',
  };
  const recorder = createCursorTrajectoryWindowRecorder<CursorTrajectorySample>();
  for (let index = 0; index < generator.observationCount; index += 1) {
    const sample: CursorTrajectorySample = {
      kind: 'sample',
      segmentId: 0,
      observationSeq: index,
      activeTimeUs: index * generator.stepUs,
      xQ8: generator.xQ8,
      yQ8: generator.baseYQ8 + (index % 2) * generator.oddYOffsetQ8,
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: index === 0 ? ['start'] : index === generator.observationCount - 1 ? ['stop'] : [],
    };
    if (simplify) yield* recorder.append(sample);
    else yield sample;
  }
  if (simplify) yield* recorder.flush();
  yield {
    kind: 'boundary',
    segmentId: 0,
    activeTimeUs: (generator.observationCount - 1) * generator.stepUs,
    reason: 'stop',
  };
}

function verifyPacking(
  recordingId: string,
  trajectoryId: string,
  records: Iterable<CursorTrajectoryRecord>,
  expected: typeof fixtures.longTrace.expected
) {
  const packer = createCursorTrajectoryBlockPacker(recordingId, trajectoryId);
  const independentHash = createHash('sha256');
  let firstEntry: unknown = null;
  let lastEntry: unknown = null;
  let segment: CursorTrajectorySegment | null = null;
  const entries: unknown[] = [];
  const accept = (packed: ReturnType<typeof packer.append>) => {
    for (const { bytes, entry } of packed) {
      expect(bytes.byteLength).toBeLessThanOrEqual(65536);
      expect(entry.recordCount).toBeLessThanOrEqual(512);
      const parsed = decodeCursorTrajectoryBlock(bytes, segment);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error('Packed block failed validation.');
      for (const record of parsed.records) {
        if (record.kind === 'segment') segment = record;
        if (record.kind === 'boundary' || record.kind === 'gap') segment = null;
      }
      const length = Buffer.alloc(4);
      length.writeUInt32LE(bytes.byteLength);
      independentHash.update(length).update(bytes);
      expect(entry.blockSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(entry.prefixSha256).toBe(independentHash.copy().digest('hex'));
      firstEntry ??= entry;
      lastEntry = entry;
      if (entries.length < expected.firstManifestEntries.length) entries.push(entry);
    }
  };
  for (const record of records) accept(packer.append(record));
  accept(packer.finish());
  const { firstBlock, lastBlock, firstManifestEntries, ...summary } = expected;
  expect(packer.summary()).toEqual(summary);
  expect(firstEntry).toEqual(firstBlock);
  expect(lastEntry).toEqual(lastBlock);
  expect(entries).toEqual(firstManifestEntries);
  expect(independentHash.digest('hex')).toBe(summary.streamSha256);
  expect(packer.finish()).toEqual([]);
}

it('uses the unchanged shared fixture bytes agreed with Desktop', () => {
  const bytes = readFileSync(new URL('./fixtures.json', import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'dc308f3fa394bc44db5686e11c5fb697ef628be5be5a1a09cde174560f4c1294'
  );
});

it.each(fixtures.cases)('matches shared SED vector $id', (fixture) => {
  const input = fixture.input.map(checkedRecord);
  const samples = input.filter(
    (record): record is CursorTrajectorySample => record.kind === 'sample'
  );
  expect(simplifyCursorTrajectoryWindow(samples).map((point) => point.observationSeq)).toEqual(
    fixture.expectedRetainedObservationSeq
  );
});

it('reproduces canonical example bytes and block/stream digests', () => {
  for (const fixture of fixtures.canonicalVectors) {
    if (!fixture.value) continue;
    const packer = createCursorTrajectoryBlockPacker(
      fixture.value.recordingId,
      fixture.value.trajectoryId
    );
    const output = fixture.value.records.flatMap((record) => packer.append(checkedRecord(record)));
    output.push(...packer.finish());
    expect(output).toHaveLength(1);
    expect(decoder.decode(output[0]!.bytes)).toBe(fixture.utf8);
    expect(output[0]!.bytes.byteLength).toBe(fixture.bytes);
    expect(output[0]!.entry.blockSha256).toBe(fixture.blockSha256);
    expect(packer.summary().streamSha256).toBe(fixture.streamSha256);
  }
});

it.each(fixtures.packingCases)('matches shared greedy packing $id', (fixture) => {
  const records = fixture.records
    ? fixture.records.map(checkedRecord)
    : generatedRecords(fixture.generator!, false);
  verifyPacking(fixture.recordingId, fixture.trajectoryId, records, fixture.expected);
});

it('matches the complete hour digest through the real TS simplifier and bounded packer', () => {
  const fixture = fixtures.longTrace;
  verifyPacking(
    fixture.recordingId,
    fixture.trajectoryId,
    generatedRecords(fixture, true),
    fixture.expected
  );
}, 60000);

it('rejects invalid coordinates, unknown fields and noncanonical byte spellings', () => {
  const fixture = fixtures.canonicalVectors[0]!;
  if (!fixture.value || !fixture.utf8) throw new Error('Missing canonical fixture.');
  for (const patch of [
    { observed: false },
    { xQ8: null },
    { xQ8: 1280 * 256 },
    { secret: 'private' },
  ]) {
    const value = structuredClone(fixture.value);
    Object.assign(value.records[1]!, patch);
    expect(decodeCursorTrajectoryBlock(encoder.encode(canonical(value)))).toBeNull();
  }
  const geometry = structuredClone(fixture.value);
  Object.assign(geometry.records[0]!, { width: 0 });
  expect(decodeCursorTrajectoryBlock(encoder.encode(canonical(geometry)))).toBeNull();
  for (const text of [
    '\ufeff' + fixture.utf8,
    fixture.utf8 + ' ',
    fixture.utf8.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1'),
    fixture.utf8.replace('"formatVersion":1', '"formatVersion":1e0'),
  ]) {
    expect(decodeCursorTrajectoryBlock(encoder.encode(text))).toBeNull();
  }
  expect(decodeCursorTrajectoryBlock(new Uint8Array(65537))).toBeNull();
});

it('retains open gaps and rejects writes after finalization without mutating earlier bytes', () => {
  const fixture = fixtures.canonicalVectors[0]!;
  if (!fixture.value) throw new Error('Missing canonical fixture.');
  const packer = createCursorTrajectoryBlockPacker(
    fixture.value.recordingId,
    fixture.value.trajectoryId
  );
  packer.append(checkedRecord(fixture.value.records[0]));
  packer.append(checkedRecord(fixture.value.records[1]));
  const blocks = packer.append({
    kind: 'gap',
    segmentId: 0,
    fromTimeUs: 1000,
    toTimeUs: null,
    firstLostObservationSeq: null,
    lastLostObservationSeq: null,
    reason: 'writer-backpressure',
  });
  const before = blocks[0]!.bytes.slice();
  expect(decodeCursorTrajectoryBlock(blocks[0]!.bytes)?.endTimeUs).toBe(1000);
  packer.finish();
  expect(() => packer.append(checkedRecord(fixture.value.records[1]))).toThrow();
  expect(blocks[0]!.bytes).toEqual(before);
});
