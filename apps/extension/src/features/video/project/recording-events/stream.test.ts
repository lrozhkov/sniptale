import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import fixture from './fixtures.json';
import { createRecordingEventsBlockPacker, type PackedRecordingEventsBlock } from './blocks';
import { isRecordingEventRecord } from './records';
import { createRecordingEventsStreamSink, createRecordingEventsStreamSource } from './stream';

const encoder = new TextEncoder();
const original = fixture.blocks.map((block) => encoder.encode(block.utf8));
const identity = { sourceRecordingId: fixture.recordingId, descriptor: fixture.descriptor };
function framed(blocks: Uint8Array[]) {
  const bytes = new Uint8Array(blocks.reduce((sum, block) => sum + 4 + block.byteLength, 0));
  let offset = 0;
  for (const block of blocks) {
    new DataView(bytes.buffer).setUint32(offset, block.byteLength, true);
    bytes.set(block, offset + 4);
    offset += 4 + block.byteLength;
  }
  return bytes;
}
async function accept(bytes: Uint8Array, sourceIdentity = identity) {
  const blocks: PackedRecordingEventsBlock[] = [];
  await new Blob([new Uint8Array(bytes).buffer]).stream().pipeTo(
    createRecordingEventsStreamSink(sourceIdentity, async (block) => {
      blocks.push(block);
    })
  );
  return blocks;
}
function packed(records: unknown[], state = 'complete') {
  const packer = createRecordingEventsBlockPacker(fixture.recordingId, fixture.eventStreamId);
  const blocks = records.flatMap((record) => packer.append(record));
  blocks.push(...packer.finish());
  return {
    bytes: framed(blocks.map((block) => block.bytes)),
    identity: { ...identity, descriptor: { ...fixture.descriptor, state, ...packer.summary() } },
  };
}

it('accepts each frozen source byte with arbitrary fragmented framing and delayed timestamps', async () => {
  const received: PackedRecordingEventsBlock[] = [];
  const writer = createRecordingEventsStreamSink(identity, async (block) => {
    received.push(block);
  }).getWriter();
  const bytes = framed(original);
  for (let offset = 0; offset < bytes.length; offset += 7)
    await writer.write(bytes.subarray(offset, offset + 7));
  await writer.close();
  expect(received.map((block) => new TextDecoder().decode(block.bytes))).toEqual(
    fixture.blocks.map((block) => block.utf8)
  );
  expect(received.map((block) => block.entry)).toEqual(fixture.manifest);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.descriptor.streamSha256);
});

it.each([
  'truncated-prefix',
  'truncated-body',
  'oversize',
  'extra',
  'wrong-hash',
  'wrong-source',
] as const)('refuses %s before a successful stream close', async (failure) => {
  let bytes = framed(original);
  let selected = identity;
  if (failure === 'truncated-prefix') bytes = bytes.subarray(0, 3);
  if (failure === 'truncated-body') bytes = bytes.subarray(0, bytes.length - 1);
  if (failure === 'oversize') new DataView(bytes.buffer).setUint32(0, 65537, true);
  if (failure === 'extra') bytes = new Uint8Array([...bytes, 1]);
  if (failure === 'wrong-hash')
    selected = { ...identity, descriptor: { ...fixture.descriptor, streamSha256: 'b'.repeat(64) } };
  if (failure === 'wrong-source')
    selected = { ...identity, sourceRecordingId: 'another-recording' };
  await expect(accept(bytes, selected)).rejects.toThrow();
});

it('refuses a complete receipt for a stream with a gap', async () => {
  await expect(
    accept(framed(original), {
      ...identity,
      descriptor: { ...fixture.descriptor, state: 'complete' },
    })
  ).rejects.toThrow();
});

it('admits Stop during Pause without a fake Resume and refuses an unclosed complete prefix', async () => {
  const segment = fixture.blocks[0]!.value.records[0]!;
  const boundary = {
    kind: 'boundary',
    recordSeq: 1,
    segmentId: 0,
    activeTimeUs: 100,
    reason: 'pause',
  };
  const paused = packed([segment, boundary]);
  await expect(accept(paused.bytes, paused.identity)).resolves.toHaveLength(1);
  const open = packed([segment]);
  await expect(accept(open.bytes, open.identity)).rejects.toThrow();
  const incomplete = packed([segment], 'incomplete');
  await expect(accept(incomplete.bytes, incomplete.identity)).resolves.toHaveLength(1);
});

it.each(['record-sequence', 'segment-sequence', 'outside-segment'] as const)(
  'refuses %s even when its frame digests match',
  async (failure) => {
    const records = structuredClone(
      fixture.blocks.flatMap<unknown>((block) => block.value.records)
    );
    const mutated = records.map((record) => {
      if (!isRecordingEventRecord(record)) throw new Error('Invalid fixture record.');
      if (failure === 'segment-sequence' && record.kind === 'segment' && record.recordSeq === 10)
        return { ...record, segmentId: 0 };
      if (failure === 'outside-segment' && record.recordSeq === 1)
        return { ...record, segmentId: 999 };
      return record;
    });
    if (failure === 'record-sequence') {
      const bytes = original.map((block) => new Uint8Array(block));
      const parsed = JSON.parse(new TextDecoder().decode(bytes[1]!));
      parsed.records[0].recordSeq += 1;
      bytes[1] = encoder.encode(JSON.stringify(parsed));
      await expect(accept(framed(bytes))).rejects.toThrow();
    } else {
      const stream = packed(mutated, 'incomplete');
      await expect(accept(stream.bytes, stream.identity)).rejects.toThrow();
    }
  }
);

it('waits for a bounded staging callback and preserves its storage refusal', async () => {
  let enter!: () => void;
  let reject!: (reason: Error) => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const stage = vi.fn(async () => {
    enter();
    await gate;
  });
  const writer = createRecordingEventsStreamSink(identity, stage).getWriter();
  const pending = writer.write(framed(original));
  const refused = expect(pending).rejects.toThrow('Storage refused');
  await entered;
  expect(stage).toHaveBeenCalledTimes(1);
  reject(new Error('Storage refused'));
  await refused;
  await expect(writer.close()).rejects.toThrow();
});

it('exports the original framed stream under target backpressure and final authority check', async () => {
  const read = vi.fn(async (sequence: number) => original[sequence]!);
  const beforeClose = vi.fn(async () => undefined);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let release!: () => void;
  let enter!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const source = createRecordingEventsStreamSource({ identity, readBlock: read, beforeClose });
  let closed = false;
  const pending = source.pipeTo(
    new WritableStream({
      async write(chunk) {
        chunks.push(new Uint8Array(chunk));
        if (chunks.length === 1) {
          enter();
          await gate;
        }
      },
      close() {
        closed = true;
      },
    })
  );
  await entered;
  expect(read).toHaveBeenCalledTimes(1);
  expect(beforeClose).not.toHaveBeenCalled();
  expect(closed).toBe(false);
  release();
  await pending;
  expect(new Uint8Array(await new Blob(chunks).arrayBuffer())).toEqual(framed(original));
  expect(beforeClose).toHaveBeenCalledTimes(1);
  expect(closed).toBe(true);
});

it.each(['stale', 'cancelled'] as const)(
  'aborts export on %s without closing the target',
  async (failure) => {
    const controller = new AbortController();
    const close = vi.fn();
    const abort = vi.fn();
    const source = createRecordingEventsStreamSource({
      identity,
      readBlock: async (sequence) => {
        if (failure === 'cancelled') controller.abort();
        return original[sequence]!;
      },
      beforeClose: async () => {
        throw new Error('Stale source generation');
      },
    });
    await expect(
      source.pipeTo(new WritableStream({ close, abort }), controller.signal)
    ).rejects.toThrow();
    expect(close).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledTimes(1);
  }
);
