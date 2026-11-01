import { expect, it, vi } from 'vitest';
import { createCursorTrajectoryBlockPacker, type PackedCursorTrajectoryBlock } from './blocks';
import { createCursorTrajectoryStreamSink, createCursorTrajectoryStreamSource } from './stream';
import type { CursorTrajectoryDescriptor, CursorTrajectoryRecord } from './types';

function fixture(gap = false) {
  const blocks: PackedCursorTrajectoryBlock[] = [];
  const packer = createCursorTrajectoryBlockPacker('original', 'a'.repeat(32));
  const records: CursorTrajectoryRecord[] = [
    {
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      width: 160,
      height: 90,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
      reason: 'start',
    },
  ];
  for (let i = 0; i < 6000; i += 1)
    records.push({
      kind: 'sample',
      segmentId: 0,
      observationSeq: i,
      activeTimeUs: i * 1000,
      xQ8: 256,
      yQ8: 512,
      observed: true,
      visible: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    });
  records.push(
    gap
      ? {
          kind: 'gap',
          segmentId: 0,
          fromTimeUs: 6000000,
          toTimeUs: null,
          firstLostObservationSeq: 6000,
          lastLostObservationSeq: 6000,
          reason: 'input-overflow',
        }
      : { kind: 'boundary', segmentId: 0, activeTimeUs: 6000000, reason: 'stop' }
  );
  for (const record of records) blocks.push(...packer.append(record));
  blocks.push(...packer.finish());
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: 'a'.repeat(32),
    state: gap ? 'incomplete' : 'complete',
    finalized: true,
    ...packer.summary(),
  };
  const bytes = new Uint8Array(descriptor.totalBytes + descriptor.totalBlocks * 4);
  let offset = 0;
  for (const block of blocks) {
    new DataView(bytes.buffer).setUint32(offset, block.bytes.byteLength, true);
    bytes.set(block.bytes, offset + 4);
    offset += block.bytes.byteLength + 4;
  }
  return {
    blocks,
    bytes,
    identity: { sourceRecordingId: 'original', width: 160, height: 90, descriptor },
  };
}

it('restores more than 4096 observations from arbitrary chunk boundaries with exact native hashes', async () => {
  const { blocks, bytes, identity } = fixture();
  const actual: PackedCursorTrajectoryBlock[] = [];
  const writer = createCursorTrajectoryStreamSink(identity, async (block) => {
    actual.push(block);
  }).getWriter();
  for (let offset = 0; offset < bytes.length; offset += 997)
    await writer.write(bytes.subarray(offset, offset + 997));
  await writer.close();
  expect(actual.map((block) => block.entry)).toEqual(blocks.map((block) => block.entry));
  expect(
    actual.every(
      (block, i) =>
        block.bytes.length === blocks[i]!.bytes.length &&
        block.bytes.every((byte, j) => byte === blocks[i]!.bytes[j])
    )
  ).toBe(true);
  expect(actual.reduce((count, block) => count + block.entry.sampleCount, 0)).toBe(6000);
});

it('accepts one-byte framing fragments and applies backpressure before another block', async () => {
  const { blocks, bytes, identity } = fixture();
  const pending = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const received = vi.fn(async () => {
    entered.resolve();
    return pending.promise;
  });
  const writer = createCursorTrajectoryStreamSink(identity, received).getWriter();
  for (let i = 0; i < 4; i += 1) await writer.write(bytes.subarray(i, i + 1));
  const writing = writer.write(bytes.subarray(4));
  await entered.promise;
  expect(received).toHaveBeenCalledTimes(1);
  pending.resolve();
  await writing;
  await writer.close();
  expect(received).toHaveBeenCalledTimes(blocks.length);
});

it.each([0, 1, 3, 4, 100, -1])(
  'refuses a truncated stream at offset %s without a successful close',
  async (length) => {
    const { bytes, identity } = fixture();
    const writer = createCursorTrajectoryStreamSink(identity, async () => {}).getWriter();
    await writer.write(bytes.subarray(0, length === -1 ? bytes.length - 1 : length));
    await expect(writer.close()).rejects.toThrow('incomplete or corrupt');
  }
);

it.each([0, 65537, 0xffffffff])(
  'refuses oversized or empty frame length %s before staging',
  async (length) => {
    const { identity } = fixture();
    const received = vi.fn();
    const writer = createCursorTrajectoryStreamSink(identity, received).getWriter();
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, length, true);
    await expect(writer.write(prefix)).rejects.toThrow('frame length');
    expect(received).not.toHaveBeenCalled();
  }
);

it('refuses extra frames, changed source, changed geometry and changed final digest', async () => {
  const { bytes, identity } = fixture();
  for (const changed of [
    { ...identity, sourceRecordingId: 'another' },
    { ...identity, width: 161 },
    { ...identity, descriptor: { ...identity.descriptor, streamSha256: 'b'.repeat(64) } },
  ]) {
    const writer = createCursorTrajectoryStreamSink(changed, async () => {}).getWriter();
    await expect(
      (async () => {
        await writer.write(bytes);
        await writer.close();
      })()
    ).rejects.toThrow();
  }
  const writer = createCursorTrajectoryStreamSink(identity, async () => {}).getWriter();
  await writer.write(bytes);
  await expect(writer.write(bytes.subarray(0, 4))).rejects.toThrow('frame length');
});

it('never upgrades a gap-bearing stream to complete', async () => {
  const { bytes, identity } = fixture(true);
  const writer = createCursorTrajectoryStreamSink(identity, async () => {}).getWriter();
  await writer.write(bytes);
  await writer.close();
  identity.descriptor.state = 'complete';
  const refused = createCursorTrajectoryStreamSink(identity, async () => {}).getWriter();
  await expect(refused.write(bytes)).rejects.toThrow('descriptor');
});

it('propagates storage refusal and cancellation after a pending block', async () => {
  const { bytes, identity } = fixture();
  const failed = createCursorTrajectoryStreamSink(identity, async () => {
    throw new Error('Storage refused');
  }).getWriter();
  await expect(failed.write(bytes)).rejects.toThrow('Storage refused');
  const controller = new AbortController();
  const cancelled = createCursorTrajectoryStreamSink(
    identity,
    async () => {
      controller.abort();
    },
    controller.signal
  ).getWriter();
  await expect(cancelled.write(bytes)).rejects.toMatchObject({ name: 'AbortError' });
});

it('rebuilds exact frozen framing with one read held behind target backpressure', async () => {
  const { blocks, identity } = fixture();
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  const readBlock = vi.fn(async (sequence: number) => blocks[sequence]!.bytes);
  const beforeClose = vi.fn(async () => {});
  let received = 0;
  const source = createCursorTrajectoryStreamSource({ identity, readBlock, beforeClose });
  const transfer = source.pipeTo(
    new WritableStream<Uint8Array>({
      async write() {
        received += 1;
        if (received === 1) {
          entered.resolve();
          await pending.promise;
        }
      },
    })
  );
  await entered.promise;
  expect(readBlock).toHaveBeenCalledTimes(1);
  expect(beforeClose).not.toHaveBeenCalled();
  pending.resolve();
  await transfer;
  expect(readBlock).toHaveBeenCalledTimes(blocks.length);
  expect(beforeClose).toHaveBeenCalledOnce();
  const actual: string[] = [];
  await source.pipeTo(
    createCursorTrajectoryStreamSink(identity, async (block) => {
      actual.push(block.entry.prefixSha256);
    })
  );
  expect(actual).toEqual(blocks.map((block) => block.entry.prefixSha256));
});

it('aborts a prepared output if its source refuses the final generation receipt', async () => {
  const { blocks, identity } = fixture();
  const closed = vi.fn();
  const aborted = vi.fn();
  const source = createCursorTrajectoryStreamSource({
    identity,
    readBlock: async (sequence) => blocks[sequence]!.bytes,
    beforeClose: async () => {
      throw new Error('Source retired');
    },
  });
  await expect(
    source.pipeTo(new WritableStream<Uint8Array>({ write() {}, close: closed, abort: aborted }))
  ).rejects.toThrow('Source retired');
  expect(closed).not.toHaveBeenCalled();
  expect(aborted).toHaveBeenCalledOnce();
});
