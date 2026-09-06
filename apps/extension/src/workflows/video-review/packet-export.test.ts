import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  BufferTarget,
  Output,
  WebMOutputFormat,
  Mp4OutputFormat,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
} from 'mediabunny';
import { expect, it } from 'vitest';
import { inspectReviewMedia } from './media-index';
import { writeReviewPackets } from './packet-export';
import type { ReviewEdit } from '../../features/video/review/types';

async function silentVideo(name: string) {
  const input = new Input({
    source: new BlobSource(new Blob([await readFile(`tooling/test/e2e/fixtures/review-${name}`)])),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: name.endsWith('.mp4') ? new Mp4OutputFormat() : new WebMOutputFormat(),
  });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const source = new EncodedVideoPacketSource(track.codec!);
    output.addVideoTrack(source);
    await output.start();
    const decoderConfig = (await track.getDecoderConfig())!;
    for await (const packet of new EncodedPacketSink(track).packets())
      await source.add(packet, { decoderConfig });
    source.close();
    await output.finalize();
    return new Blob([target.buffer!]);
  } finally {
    input.dispose();
  }
}

it.each(['avc-aac.mp4', 'hevc-aac.mp4', 'vp8-opus.webm', 'vp9-opus.webm', 'av1-opus.webm'])(
  'retimes every compressed video packet at all four speeds without adding audio: %s',
  async (name) => {
    const file = await silentVideo(name);
    const signal = new AbortController().signal;
    const index = await inspectReviewMedia(file, signal);
    const expected = await videoHashes(file);
    for (const rate of [1.25, 1.5, 2, 4] as const) {
      let bytes = new Uint8Array(0);
      const receipt = await writeReviewPackets({
        file,
        index,
        signal,
        edits: [
          {
            id: 'speed',
            kind: 'speed',
            start: 0,
            end: 12,
            requestedStart: 0,
            requestedEnd: 12,
            rate,
            audio: 'mute',
          },
        ],
        writer: {
          async writeAt(position, chunk) {
            const data = new Uint8Array(await chunk.arrayBuffer());
            const next = new Uint8Array(Math.max(bytes.length, position + data.length));
            next.set(bytes);
            next.set(data, position);
            bytes = next;
          },
        },
      });
      const result = await videoHashes(new Blob([bytes]));
      expect(result.hashes).toEqual(expected.hashes);
      expect(result.duration).toBeCloseTo(12 / rate, 2);
      expect(receipt.audioPackets).toBe(0);
      expect(receipt.audioReencoded).toBe(false);
    }
  }
);

const edits: ReviewEdit[] = [
  { id: 'one', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  { id: 'two', kind: 'cut', start: 6, end: 8, requestedStart: 6, requestedEnd: 8 },
];

it('preserves delayed audio and retained gaps without copying audio across a source cut', async () => {
  const input = new Input({
    source: new BlobSource(
      new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')])
    ),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new EncodedVideoPacketSource('vp8');
  const audio = new EncodedAudioPacketSource('opus');
  output.addVideoTrack(video);
  output.addAudioTrack(audio);
  try {
    const v = (await input.getPrimaryVideoTrack())!;
    const a = (await input.getPrimaryAudioTrack())!;
    const vc = (await v.getDecoderConfig())!;
    const ac = (await a.getDecoderConfig())!;
    await output.start();
    for await (const packet of new EncodedPacketSink(v).packets()) {
      await video.add(packet, { decoderConfig: vc });
    }
    for await (const packet of new EncodedPacketSink(a).packets()) {
      const timestamp = packet.timestamp + 1;
      if (timestamp >= 12 || (timestamp >= 6 && timestamp < 7)) continue;
      await audio.add(packet.clone({ timestamp }), { decoderConfig: ac });
    }
    video.close();
    audio.close();
    await output.finalize();
  } finally {
    input.dispose();
  }
  const file = new Blob([target.buffer!]);
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  let bytes = new Uint8Array(0);
  const receipt = await writeReviewPackets({
    file,
    index,
    signal,
    edits: [edits[0]!],
    writer: {
      async writeAt(position, chunk) {
        const data = new Uint8Array(await chunk.arrayBuffer());
        const next = new Uint8Array(Math.max(bytes.length, position + data.length));
        next.set(bytes);
        next.set(data, position);
        bytes = next;
      },
    },
  });
  const result = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  const original = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = (await result.getPrimaryAudioTrack())!;
    const timestamps: number[] = [];
    const hashes: string[] = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      timestamps.push(packet.timestamp);
      hashes.push(createHash('sha256').update(packet.data).digest('hex'));
    }
    const expected: string[] = [];
    for await (const packet of new EncodedPacketSink(
      (await original.getPrimaryAudioTrack())!
    ).packets()) {
      if (packet.timestamp < 2 || packet.timestamp >= 4)
        expected.push(createHash('sha256').update(packet.data).digest('hex'));
    }
    expect(hashes).toEqual(expected);
    expect(timestamps[0]).toBeCloseTo(1, 2);
    expect(timestamps.some((time) => time >= 4.02 && time < 4.98)).toBe(false);
    expect(receipt.audioRanges[0]!.sourceEnd).toBeLessThanOrEqual(2.022);
    expect(receipt.audioRanges[0]!.resultStart).toBeCloseTo(1, 2);
    expect(receipt.audioRanges.at(-1)!.sourceEnd).toBeLessThanOrEqual(12.022);
  } finally {
    result.dispose();
    original.dispose();
  }
});
async function videoHashes(file: Blob, omitCuts = false) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const hashes: string[] = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      if (
        omitCuts &&
        edits.some((edit) => packet.timestamp >= edit.start && packet.timestamp < edit.end)
      )
        continue;
      hashes.push(createHash('sha256').update(packet.data).digest('hex'));
    }
    return {
      hashes,
      duration: (await input.getDurationFromMetadata()) ?? (await track.computeDuration()),
    };
  } finally {
    input.dispose();
  }
}
it.each(['avc-aac.mp4', 'hevc-aac.mp4', 'vp8-opus.webm', 'vp9-opus.webm', 'av1-opus.webm'])(
  'copies unchanged compressed video packets through real %s cuts',
  async (name) => {
    const file = new Blob([await readFile(`tooling/test/e2e/fixtures/review-${name}`)]);
    const controller = new AbortController();
    const index = await inspectReviewMedia(file, controller.signal);
    let bytes = new Uint8Array(0);
    const receipt = await writeReviewPackets({
      file,
      index,
      edits,
      signal: controller.signal,
      writer: {
        async writeAt(position, chunk) {
          const data = new Uint8Array(await chunk.arrayBuffer());
          const next = new Uint8Array(Math.max(bytes.length, position + data.length));
          next.set(bytes);
          next.set(data, position);
          bytes = next;
        },
      },
    });
    const result = await videoHashes(new Blob([bytes]));
    expect(result.hashes).toEqual((await videoHashes(file, true)).hashes);
    expect(result.hashes).toHaveLength(80);
    expect(result.duration).toBeCloseTo(8, 2);
    expect(receipt.videoPackets).toBe(80);
    expect(receipt.audioPackets).toBeGreaterThan(0);
    expect(receipt.audioRanges).toHaveLength(3);
    expect(Math.abs(receipt.audioRanges.at(-1)!.resultEnd - receipt.resultDuration)).toBeLessThan(
      0.022
    );
  }
);
it('rejects forged non-key cuts and propagates streamed quota failure', async () => {
  const file = new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')]);
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  const writer = {
    async writeAt() {
      throw new Error('Quota exceeded');
    },
  };
  await expect(
    writeReviewPackets({ file, index, signal, writer, edits: [{ ...edits[0]!, start: 1 }] })
  ).rejects.toThrow('verified');
  await expect(writeReviewPackets({ file, index, signal, writer, edits })).rejects.toThrow('Quota');
});
it('stops a real packet stream on cancellation', async () => {
  const file = new Blob([await readFile('tooling/test/e2e/fixtures/review-avc-aac.mp4')]);
  const controller = new AbortController();
  const index = await inspectReviewMedia(file, controller.signal);
  await expect(
    writeReviewPackets({
      file,
      index,
      edits,
      signal: controller.signal,
      writer: {
        async writeAt() {
          controller.abort();
        },
      },
    })
  ).rejects.toThrow();
});

it.each([0, 0.5])('retains variable-rate silent video with timestamp origin %s', async (origin) => {
  const source = new Input({
    source: new BlobSource(
      new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')])
    ),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new EncodedVideoPacketSource('vp8');
  output.addVideoTrack(video);
  try {
    const track = (await source.getPrimaryVideoTrack())!;
    const config = (await track.getDecoderConfig())!;
    let time = origin;
    let ordinal = 0;
    await output.start();
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const duration = ordinal++ % 2 ? 0.15 : 0.05;
      await video.add(packet.clone({ timestamp: time, duration }), { decoderConfig: config });
      time += duration;
    }
    video.close();
    await output.finalize();
  } finally {
    source.dispose();
  }
  const file = new Blob([target.buffer!]);
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  expect(index.audioCodec).toBeNull();
  const start = index.boundaries.find((value) => value > origin + 1)!;
  const end = index.boundaries.at(-2)!;
  let bytes = new Uint8Array(0);
  const writer = {
    async writeAt(position: number, chunk: Blob) {
      const data = new Uint8Array(await chunk.arrayBuffer());
      const next = new Uint8Array(Math.max(bytes.length, position + data.length));
      next.set(bytes);
      next.set(data, position);
      bytes = next;
    },
  };
  const receipt = await writeReviewPackets({
    file,
    index,
    signal,
    writer,
    edits: [
      { id: 'first', kind: 'cut', start: 0, end: start, requestedStart: 0, requestedEnd: start },
      {
        id: 'last',
        kind: 'cut',
        start: end,
        end: index.duration,
        requestedStart: end,
        requestedEnd: index.duration,
      },
    ],
  });
  const result = new Blob([bytes]);
  expect((await videoHashes(result)).hashes).toEqual(
    (await videoHashes(file)).hashes.slice(20, 100)
  );
  expect((await videoHashes(result)).duration).toBeCloseTo(8, 2);
  expect(receipt.audioPackets).toBe(0);
  expect(receipt.audioRanges).toEqual([]);
  await expect(
    writeReviewPackets({
      file,
      index,
      signal,
      writer,
      edits: [
        {
          id: 'all',
          kind: 'cut',
          start: 0,
          end: index.duration,
          requestedStart: 0,
          requestedEnd: index.duration,
        },
      ],
    })
  ).rejects.toThrow('empty');
});
