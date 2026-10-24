import {
  ALL_FORMATS,
  AppendOnlyStreamTarget,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type Target,
} from 'mediabunny';
import { describe, expect, it, vi } from 'vitest';
import { createLiveOutputTarget } from './live-output-target';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createMuxer(target: Target, container: 'webm' | 'mp4' = 'webm') {
  const output = new Output({
    target,
    format:
      container === 'webm'
        ? new WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 1 })
        : new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
  });
  const source = new EncodedAudioPacketSource('opus');
  output.addAudioTrack(source);
  return { output, source };
}

async function addPackets(source: EncodedAudioPacketSource, count: number) {
  for (let index = 0; index < count; index += 1) {
    const data = new Uint8Array(1024).fill(index % 256);
    await source.add(new EncodedPacket(data, 'key', index / 50, 1 / 50), {
      decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 },
    });
  }
}

async function readPackets(chunks: Blob[]) {
  const input = new Input({ source: new BlobSource(new Blob(chunks)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('Missing muxed audio track.');
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      packets.push(packet);
    }
    return packets;
  } finally {
    input.dispose();
  }
}

describe('live encoded output batching', () => {
  it.each(['webm', 'mp4'] as const)(
    'groups %s packet writes and preserves every byte through the final partial block',
    async (container) => {
      const chunks: Blob[] = [];
      const append = vi.fn(async (chunk: Blob) => {
        chunks.push(chunk);
      });
      const { output, source } = createMuxer(createLiveOutputTarget({ append }), container);
      await output.start();
      await addPackets(source, 150);
      source.close();
      await output.finalize();

      expect(append.mock.calls.length).toBeGreaterThan(1);
      expect(append.mock.calls.length).toBeLessThan(6);
      expect(chunks.slice(0, -1).every((chunk) => chunk.size === 64 * 1024)).toBe(true);
      expect(chunks.at(-1)!.size).toBeGreaterThan(0);
      expect(chunks.at(-1)!.size).toBeLessThan(64 * 1024);
      const packets = await readPackets(chunks);
      expect(packets).toHaveLength(150);
      packets.forEach((packet, index) => {
        expect(packet.data).toEqual(new Uint8Array(1024).fill(index));
        expect(packet.timestamp).toBeCloseTo(index / 50, 3);
      });
    }
  );

  it('reproduces the per-packet durable-write amplification of the previous target', async () => {
    const append = vi.fn(async (_chunk: Uint8Array) => undefined);
    const target = new AppendOnlyStreamTarget(new WritableStream<Uint8Array>({ write: append }));
    const { output, source } = createMuxer(target);
    await output.start();
    await addPackets(source, 150);
    source.close();
    await output.finalize();
    expect(append.mock.calls.length).toBeGreaterThan(100);
  });

  it('does not finalize or publish until the final partial block is durably acknowledged', async () => {
    const entered = deferred();
    const acknowledged = deferred();
    const append = vi.fn(async (_chunk: Blob) => {
      entered.resolve();
      await acknowledged.promise;
    });
    const publish = vi.fn();
    const { output, source } = createMuxer(createLiveOutputTarget({ append }));
    await output.start();
    await addPackets(source, 2);
    source.close();
    const finalize = output.finalize().then(publish);
    await entered.promise;
    expect(publish).not.toHaveBeenCalled();
    acknowledged.resolve();
    await finalize;
    expect(append).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('applies durable backpressure while a full encoded block is awaiting acknowledgement', async () => {
    const entered = deferred();
    const acknowledged = deferred();
    const chunks: Blob[] = [];
    const append = vi.fn(async (chunk: Blob) => {
      chunks.push(chunk);
      entered.resolve();
      await acknowledged.promise;
    });
    const { output, source } = createMuxer(createLiveOutputTarget({ append }));
    await output.start();
    let inputCompleted = false;
    const input = addPackets(source, 150).then(() => {
      inputCompleted = true;
    });
    await entered.promise;
    expect(inputCompleted).toBe(false);
    expect(append).toHaveBeenCalledTimes(1);
    acknowledged.resolve();
    await input;
    source.close();
    await output.finalize();
    expect(await readPackets(chunks)).toHaveLength(150);
  });

  it('refuses a format that seeks into bytes already acknowledged by staging', async () => {
    const chunks: Blob[] = [];
    const append = vi.fn(async (chunk: Blob) => {
      chunks.push(chunk);
    });
    const output = new Output({
      target: createLiveOutputTarget({ append }),
      format: new Mp4OutputFormat({ fastStart: false }),
    });
    const source = new EncodedAudioPacketSource('opus');
    output.addAudioTrack(source);
    await output.start();
    await addPackets(source, 150);
    source.close();
    await expect(output.finalize()).rejects.toThrow('append contiguous bytes');
    expect(chunks.every((chunk) => chunk.size === 64 * 1024)).toBe(true);
  });

  it('propagates a final durable append failure without publishing', async () => {
    const failure = new Error('Durable staging refused the block.');
    const append = vi.fn(async (_chunk: Blob) => {
      throw failure;
    });
    const publish = vi.fn();
    const { output, source } = createMuxer(createLiveOutputTarget({ append }));
    await output.start();
    await addPackets(source, 2);
    source.close();
    await expect(output.finalize().then(publish)).rejects.toBe(failure);
    expect(publish).not.toHaveBeenCalled();
  });

  it('cancels an unfinished output without appending its volatile remainder or publishing', async () => {
    const append = vi.fn(async (_chunk: Blob) => undefined);
    const publish = vi.fn();
    const { output, source } = createMuxer(createLiveOutputTarget({ append }));
    await output.start();
    await addPackets(source, 2);
    await output.cancel();
    expect(append).not.toHaveBeenCalled();
    await expect(output.finalize().then(publish)).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });
});
