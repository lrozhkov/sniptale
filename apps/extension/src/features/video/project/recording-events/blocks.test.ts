import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures.json';
import holdFixture from './keyboard-hold-fixtures.json';
import { createRecordingEventsBlockPacker, decodeRecordingEventsBlock } from './blocks';
import { isRecordingEventRecord } from './records';
import type { PackedRecordingEventsBlock } from './blocks';
import type { RecordingEventRecord } from './types';

const encode = (text: string) => new TextEncoder().encode(text);
const records: RecordingEventRecord[] = fixture.blocks
  .flatMap<unknown>((block) => block.value.records)
  .map((record) => {
    if (!isRecordingEventRecord(record)) throw new Error('Invalid frozen fact.');
    return record;
  });
const packer = () => createRecordingEventsBlockPacker(fixture.recordingId, fixture.eventStreamId);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('recording event blocks', () => {
  it('preserves each frozen source block and verifies independent source-byte digests', () => {
    const stream = createHash('sha256');
    for (const block of fixture.blocks) {
      const bytes = encode(block.utf8);
      expect(decodeRecordingEventsBlock(bytes)).toEqual(block.value);
      expect(digest(bytes)).toBe(block.blockSha256);
      const length = new Uint8Array(4);
      new DataView(length.buffer).setUint32(0, bytes.byteLength, true);
      stream.update(length).update(bytes);
    }
    expect(stream.digest('hex')).toBe(fixture.descriptor.streamSha256);
    expect(digest(encode(JSON.stringify(fixture)))).not.toBe(fixture.descriptor.streamSha256);
  });

  it('reproduces the shared greedy blocks, manifests and stream digest', () => {
    const writer = packer();
    const blocks = records.flatMap((record) => writer.append(record));
    blocks.push(...writer.finish());
    expect(blocks).toHaveLength(3);
    blocks.forEach((block, index) => {
      expect(new TextDecoder().decode(block.bytes)).toBe(fixture.blocks[index]?.utf8);
      expect(block.entry).toEqual(fixture.manifest[index]);
    });
    expect(writer.summary()).toEqual({
      totalBlocks: 3,
      totalRecords: 18,
      totalBytes: 5528,
      streamSha256: fixture.descriptor.streamSha256,
    });
    expect(writer.finish()).toEqual([]);
    expect(() => writer.append(records[0])).toThrow();
  });

  it('keeps 5000 independent actions and 700 signals with bounded pending memory', () => {
    const writer = packer();
    let seq = 0;
    const blocks: PackedRecordingEventsBlock[] = [];
    for (const source of records) {
      if (source.kind === 'action' && source.action.kind === 'CLICK') {
        for (let i = 0; i < 5000; i++) {
          blocks.push(
            ...writer.append({
              ...source,
              recordSeq: seq++,
              activeTimeUs: i,
              action: { ...source.action, id: `click-${i}`, timeUs: i },
            })
          );
          expect(writer.pendingRecordCount).toBeLessThanOrEqual(512);
        }
      }
      if (source.kind === 'signal' && source.signal.kind === 'static-frame') {
        for (let i = 0; i < 700; i++)
          blocks.push(
            ...writer.append({
              ...source,
              recordSeq: seq++,
              signal: { ...source.signal, id: `signal-${i}` },
            })
          );
      }
    }
    blocks.push(...writer.finish());
    let actions = 0;
    let signals = 0;
    let sequence = 0;
    const stream = createHash('sha256');
    for (const block of blocks) {
      expect(block.bytes.byteLength).toBeLessThanOrEqual(65536);
      const decoded = decodeRecordingEventsBlock(block.bytes);
      if (!decoded) throw new Error('Invalid produced block.');
      expect(decoded.records.length).toBeLessThanOrEqual(512);
      for (const record of decoded.records) {
        expect(record.recordSeq).toBe(sequence++);
        if (record.kind === 'action') expect(record.action.id).toBe(`click-${actions++}`);
        if (record.kind === 'signal') expect(record.signal.id).toBe(`signal-${signals++}`);
      }
      const length = new Uint8Array(4);
      new DataView(length.buffer).setUint32(0, block.bytes.byteLength, true);
      stream.update(length).update(block.bytes);
      expect(block.entry.prefixSha256).toBe(stream.copy().digest('hex'));
    }
    expect([actions, signals, sequence]).toEqual([5000, 700, 5700]);
    expect(writer.summary().streamSha256).toBe(stream.digest('hex'));
  });

  it('seals at explicit barriers and does not seal when a new segment opens', () => {
    const writer = packer();
    const segment = records[0];
    if (!segment || segment.kind !== 'segment') throw new Error('Missing segment.');
    expect(writer.append(segment)).toEqual([]);
    const sealed = writer.append({
      kind: 'boundary',
      recordSeq: 1,
      segmentId: 0,
      activeTimeUs: 10,
      reason: 'pause',
    });
    expect(sealed[0]?.entry.recordCount).toBe(2);
    expect(
      writer.append({ ...segment, recordSeq: 2, segmentId: 1, activeTimeUs: 20, reason: 'resume' })
    ).toEqual([]);
    expect(writer.pendingRecordCount).toBe(1);
    expect(writer.finish()[0]?.entry.recordCount).toBe(1);
  });

  it('preserves source emission order when aggregate envelope times decrease', () => {
    const writer = packer();
    const source = records.find((record) => record.kind === 'signal');
    if (!source) throw new Error('Missing signal fact.');
    expect(writer.append({ ...source, recordSeq: 0, activeTimeUs: 900000 })).toEqual([]);
    expect(writer.append({ ...source, recordSeq: 1, activeTimeUs: 100000 })).toEqual([]);
    const block = writer.finish()[0];
    if (!block) throw new Error('Missing block.');
    const decoded = decodeRecordingEventsBlock(block.bytes);
    expect(decoded?.records.map((record) => record.activeTimeUs)).toEqual([900000, 100000]);
    expect([decoded?.startTimeUs, decoded?.endTimeUs]).toEqual([100000, 900000]);
  });

  it('refuses unknown records without losing or sealing the accepted prefix', () => {
    const writer = packer();
    expect(writer.append(records[0])).toEqual([]);
    expect(() => writer.append({ ...records[1], recordSeq: 1, targetId: 'private' })).toThrow();
    expect(writer.pendingRecordCount).toBe(1);
    expect(writer.summary().totalRecords).toBe(0);
    expect(writer.append(records[1])).toEqual([]);
    expect(writer.finish()[0]?.entry.recordCount).toBe(2);
  });

  it('rejects altered header bounds, order, unknown fields and oversized blocks', () => {
    const block = fixture.blocks[0];
    if (!block) throw new Error('Missing source block.');
    for (const change of [
      { startTimeUs: 1 },
      { endTimeUs: 1 },
      { sequence: -1 },
      { extra: null },
      { records: [...block.value.records].reverse() },
      { records: [] },
    ])
      expect(
        decodeRecordingEventsBlock(encode(JSON.stringify({ ...block.value, ...change })))
      ).toBeNull();
    expect(decodeRecordingEventsBlock(new Uint8Array(65537))).toBeNull();
  });
});

describe('shared TS/Rust anonymous hold vectors', () => {
  it.each(holdFixture.cases)('$name', (source) => {
    const bytes = encode(source.utf8);
    expect(digest(bytes)).toBe(source.sha256);
    const decoded = decodeRecordingEventsBlock(bytes);
    expect(decoded !== null).toBe(source.accepted);
  });
});
