import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { AudioSample, EncodedAudioPacketSource, type EncodedPacket } from 'mediabunny';
import { createPresentationAudioEncoder } from './processed-audio-encoder';

class FakeData {
  readonly timestamp: number;
  readonly numberOfFrames: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly format: AudioDataInit['format'];
  readonly data: AllowSharedBufferSource;
  close = vi.fn();
  constructor(input: AudioDataInit) {
    this.timestamp = input.timestamp;
    this.numberOfFrames = input.numberOfFrames;
    this.numberOfChannels = input.numberOfChannels;
    this.sampleRate = input.sampleRate;
    this.format = input.format;
    if (!(input.data instanceof Float32Array)) throw new Error('Expected planar float data');
    this.data = input.data.slice();
  }
}
class FakeEncoder extends EventTarget {
  static current: FakeEncoder;
  state: CodecState = 'unconfigured';
  encodeQueueSize = 0;
  config: AudioEncoderConfig | null = null;
  frames: FakeData[] = [];
  onEncode: ((data: FakeData) => void) | undefined;
  onFlush: (() => Promise<void>) | undefined;
  configure = vi.fn((config: AudioEncoderConfig) => {
    this.config = config;
    this.state = 'configured';
  });
  close = vi.fn(() => {
    this.state = 'closed';
  });
  constructor(readonly callbacks: AudioEncoderInit) {
    super();
    FakeEncoder.current = this;
  }
  encode(data: FakeData) {
    this.frames.push(data);
    this.onEncode?.(data);
  }
  async flush() {
    await this.onFlush?.();
  }
  emit(start: number, frames: number, config?: AudioDecoderConfig, size = 4) {
    const copyTo = vi.fn((target: AllowSharedBufferSource) => {
      const bytes = ArrayBuffer.isView(target)
        ? new Uint8Array(target.buffer, target.byteOffset, target.byteLength)
        : new Uint8Array(target);
      bytes.fill(17);
    });
    const chunk: EncodedAudioChunk = {
      timestamp: Math.round((start * 1e6) / 48000),
      duration: Math.round((frames * 1e6) / 48000),
      byteLength: size,
      type: 'key',
      copyTo,
    };
    this.callbacks.output(chunk, config ? { decoderConfig: config } : {});
    return copyTo;
  }
  dequeue() {
    this.encodeQueueSize = 0;
    this.dispatchEvent(new Event('dequeue'));
  }
}
const aacConfig = (): AudioDecoderConfig => ({
  codec: 'mp4a.40.2',
  sampleRate: 48000,
  numberOfChannels: 2,
  description: new Uint8Array([17, 144]),
});
function opusConfig(preSkip = 312): AudioDecoderConfig {
  const description = new Uint8Array(19);
  description.set(new TextEncoder().encode('OpusHead'));
  description[8] = 1;
  description[9] = 2;
  new DataView(description.buffer).setUint16(10, preSkip, true);
  new DataView(description.buffer).setUint32(12, 48000, true);
  return { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, description };
}
function sample(frames: number, start = 0, rate = 48000, channels = 2) {
  return new AudioSample({
    data: new Float32Array(frames * channels),
    format: 'f32-planar',
    sampleRate: rate,
    numberOfChannels: channels,
    timestamp: start / 48000,
  });
}
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let controller: AbortController;
let packets: { packet: EncodedPacket; meta?: EncodedAudioChunkMetadata }[];
let sink: MockInstance<EncodedAudioPacketSource['add']>;
let closeSource: MockInstance<EncodedAudioPacketSource['close']>;
beforeEach(() => {
  controller = new AbortController();
  packets = [];
  vi.stubGlobal('AudioEncoder', FakeEncoder);
  vi.stubGlobal('AudioData', FakeData);
  sink = vi
    .spyOn(EncodedAudioPacketSource.prototype, 'add')
    .mockImplementation(async (packet, meta) => {
      packets.push({ packet, ...(meta ? { meta } : {}) });
    });
  closeSource = vi
    .spyOn(EncodedAudioPacketSource.prototype, 'close')
    .mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const create = (frameCount: number, codec: 'aac' | 'opus' = 'aac') =>
  createPresentationAudioEncoder({ codec, frameCount, signal: controller.signal });
async function add(owner: ReturnType<typeof create>, frames: number, start = 0) {
  const input = sample(frames, start);
  try {
    await owner.add(input);
  } finally {
    input.close();
  }
}

it('exposes the immutable window before encoding without caller pre-skip', () => {
  const owner = create(960, 'opus');
  expect(owner.source).toBeInstanceOf(EncodedAudioPacketSource);
  expect(owner.window).toEqual({ kind: 'opus-webm', sampleRate: 48000, frameCount: 960 });
  expect(Object.isFrozen(owner.window)).toBe(true);
  expect(FakeEncoder.current.config).toMatchObject({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
  });
  owner.dispose();
});
it.each([1, 960, 1023, 1024, 1025, 14400, 14640, 47900, 74400, 144001])(
  'maps AAC %s frames and excludes encode-only tail packets',
  async (frameCount) => {
    const observed = vi.fn();
    const owner = createPresentationAudioEncoder({
      codec: 'aac',
      frameCount,
      signal: controller.signal,
      onPacket: observed,
    });
    const encoder = FakeEncoder.current;
    encoder.onFlush = async () => {
      for (let at = 0; at < frameCount + 4096; at += 1024) encoder.emit(at, 1024, aacConfig());
    };
    for (let at = 0; at < frameCount; at += 48000)
      await add(owner, Math.min(48000, frameCount - at), at);
    await owner.finish();
    expect(encoder.frames.map((frame) => frame.numberOfFrames)).toEqual(
      Array.from({ length: Math.ceil((frameCount + 4096) / 48000) }, (_, i) =>
        Math.min(48000, frameCount + 4096 - i * 48000)
      )
    );
    expect(encoder.frames.at(-1)?.timestamp).toBe(Math.floor((frameCount + 4095) / 48000) * 1e6);
    const tail = encoder.frames.at(-1)!.data;
    expect(tail).toBeInstanceOf(Float32Array);
    if (!(tail instanceof Float32Array)) throw new Error('Expected planar silence');
    expect(tail.every((value) => value === 0)).toBe(true);
    expect(encoder.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
    expect(packets).toHaveLength(Math.ceil(frameCount / 1024));
    for (let i = 0; i < packets.length; i++) {
      expect(packets[i]!.packet.timestamp).toBe(Math.floor((i * 1024 * 1e6) / 48000) / 1e6);
      expect([...packets[i]!.packet.data]).toEqual([17, 17, 17, 17]);
    }
    const final = packets.at(-1)!.packet;
    expect(Math.round((final.timestamp + final.duration) * 1e6)).toBe(
      Math.ceil((frameCount * 1e6) / 48000)
    );
    expect(observed).toHaveBeenCalledTimes(packets.length);
    expect(closeSource).toHaveBeenCalledOnce();
    expect(encoder.close).toHaveBeenCalledOnce();
  }
);
it.each([0, 120, 312, 960])(
  'uses emitted Opus pre-skip %s and retains complete final packets',
  async (preSkip) => {
    const owner = create(1025, 'opus');
    const encoder = FakeEncoder.current;
    encoder.onFlush = async () => {
      for (let at = 0; at < 1025 + preSkip + 960; at += 960)
        encoder.emit(at, 960, opusConfig(preSkip));
    };
    await add(owner, 1025);
    await owner.finish();
    expect(encoder.frames).toHaveLength(1);
    expect(packets).toHaveLength(Math.ceil((1025 + preSkip) / 960));
    expect(packets.at(-1)!.packet.duration).toBeCloseTo(0.02, 12);
    expect(packets[0]!.meta!.decoderConfig!.description).toEqual(opusConfig(preSkip).description);
  }
);
it.each([0, -1, NaN, Infinity, 1.5, 48000 * 93600 + 1])(
  'rejects invalid frame count %s before native creation',
  (frameCount) => {
    expect(() => create(frameCount)).toThrow('Invalid processed audio window');
  }
);
it('admits the complete 26-hour sequence bound without allocating it', () => {
  const owner = create(48000 * 93600);
  expect(owner.window.frameCount).toBe(4492800000);
  owner.dispose();
});
it.each([
  { frames: 48001, start: 0, rate: 48000, channels: 2 },
  { frames: 10, start: 1, rate: 48000, channels: 2 },
  { frames: 10, start: 0, rate: 44100, channels: 2 },
  { frames: 10, start: 0, rate: 48000, channels: 1 },
])('rejects invalid PCM layout or position %#', async ({ frames, start, rate, channels }) => {
  const owner = create(48000);
  const input = sample(frames, start, rate, channels);
  try {
    await expect(owner.add(input)).rejects.toThrow('Invalid processed audio sample');
  } finally {
    input.close();
  }
  expect(FakeEncoder.current.frames).toHaveLength(0);
});
it('requires exact content count and rejects an overrun', async () => {
  let owner = create(10);
  await add(owner, 9);
  await expect(owner.finish()).rejects.toThrow('Incomplete processed audio input');
  owner = create(10);
  await expect(add(owner, 11)).rejects.toThrow('Invalid processed audio sample');
});
it('requires complete encoded coverage', async () => {
  const owner = create(1025);
  FakeEncoder.current.onFlush = async () => {
    FakeEncoder.current.emit(0, 1024, aacConfig());
  };
  await add(owner, 1025);
  await expect(owner.finish()).rejects.toThrow('Incomplete processed audio packet coverage');
});
it.each(['missing', 'layout', 'codec', 'description', 'changed', 'gap', 'overlap'])(
  'rejects malformed native output: %s',
  async (problem) => {
    const owner = create(2048);
    const encoder = FakeEncoder.current;
    encoder.onFlush = async () => {
      const config = aacConfig();
      if (problem === 'layout') config.numberOfChannels = 1;
      if (problem === 'codec') config.codec = 'opus';
      if (problem === 'description') config.description = new Uint8Array([0, 0]);
      encoder.emit(0, 1024, problem === 'missing' ? undefined : config);
      if (problem === 'changed') {
        config.description = new Uint8Array([17, 144, 0]);
        encoder.emit(1024, 1024, config);
      }
      if (problem === 'gap') encoder.emit(2048, 1024);
      if (problem === 'overlap') encoder.emit(0, 1024);
    };
    await add(owner, 2048);
    await expect(owner.finish()).rejects.toThrow();
    expect(encoder.state).toBe('closed');
    expect(closeSource).not.toHaveBeenCalled();
  }
);
it('rejects malformed OpusHead and ignores callbacks after failure', async () => {
  const owner = create(960, 'opus');
  const encoder = FakeEncoder.current;
  const config = opusConfig();
  config.description = new Uint8Array(19);
  encoder.onEncode = () => {
    encoder.emit(0, 960, config);
  };
  await add(owner, 960);
  await expect(owner.finish()).rejects.toThrow('Invalid processed OpusHead');
  const copy = encoder.emit(0, 960, opusConfig());
  expect(copy).not.toHaveBeenCalled();
  expect(sink).not.toHaveBeenCalled();
});
it('closes owned AudioData when encode throws and leaves the input sample caller-owned', async () => {
  const owner = create(10);
  const encoder = FakeEncoder.current;
  encoder.onEncode = () => {
    throw new Error('encode');
  };
  const input = sample(10);
  await owner.add(input);
  await expect(owner.finish()).rejects.toThrow('encode');
  expect(encoder.frames[0]!.close).toHaveBeenCalledOnce();
  const plane = new Float32Array(10);
  input.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
  input.close();
});
it('propagates flush and native asynchronous errors', async () => {
  let owner = create(10);
  await add(owner, 10);
  FakeEncoder.current.onFlush = async () => {
    throw new Error('flush');
  };
  await expect(owner.finish()).rejects.toThrow('flush');
  owner = create(10);
  const encoder = FakeEncoder.current;
  encoder.callbacks.error(new DOMException('native'));
  await expect(add(owner, 10)).rejects.toThrow('native');
});
it('awaits native dequeue and removes the cancelled wait listener', async () => {
  const owner = create(48000);
  const encoder = FakeEncoder.current;
  encoder.encodeQueueSize = 2;
  const remove = vi.spyOn(encoder, 'removeEventListener');
  const pending = add(owner, 48000);
  await Promise.resolve();
  expect(encoder.frames).toHaveLength(0);
  encoder.dequeue();
  await pending;
  expect(encoder.frames).toHaveLength(1);
  expect(remove).toHaveBeenCalledWith('dequeue', expect.any(Function));
  owner.dispose();
});
it('cancels a native queue wait and rejects overlapping calls without buffering PCM', async () => {
  const owner = create(10);
  FakeEncoder.current.encodeQueueSize = 2;
  const first = add(owner, 10);
  await Promise.resolve();
  await expect(add(owner, 10)).rejects.toThrow('Await the previous');
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
});
it('serializes slow mux writes and stops later writes after abort', async () => {
  const held = deferred();
  sink.mockImplementationOnce(async (packet, meta) => {
    packets.push({ packet, ...(meta ? { meta } : {}) });
    await held.promise;
  });
  const owner = create(48000);
  const encoder = FakeEncoder.current;
  encoder.onEncode = () => {
    encoder.emit(0, 1024, aacConfig());
    encoder.emit(1024, 1024);
  };
  const running = add(owner, 48000);
  await vi.waitFor(() => expect(sink).toHaveBeenCalledOnce());
  expect(sink).toHaveBeenCalledOnce();
  controller.abort();
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  held.resolve();
  await Promise.resolve();
  expect(sink).toHaveBeenCalledOnce();
});
it('propagates mux failure and never publishes the queued successor', async () => {
  sink.mockRejectedValueOnce(new Error('mux'));
  const owner = create(48000);
  const encoder = FakeEncoder.current;
  encoder.onEncode = () => {
    encoder.emit(0, 1024, aacConfig());
    encoder.emit(1024, 1024);
  };
  await expect(add(owner, 48000)).rejects.toThrow('mux');
  expect(sink).toHaveBeenCalledOnce();
});
it.each(['bytes', 'count'])(
  'enforces the hard encoded queue %s bound before copying another packet',
  async (kind) => {
    const held = deferred();
    sink.mockReturnValue(held.promise);
    const owner = create(48000, 'opus');
    const encoder = FakeEncoder.current;
    let lastCopy: ReturnType<typeof vi.fn> | undefined;
    encoder.onEncode = () => {
      for (let at = 0; at < 1025 && encoder.state !== 'closed'; at++)
        lastCopy = encoder.emit(at, 1, opusConfig(0), kind === 'bytes' ? 4 * 1024 * 1024 : 1);
    };
    await expect(add(owner, 48000)).rejects.toThrow('queue exceeded');
    expect(lastCopy).not.toHaveBeenCalled();
    held.resolve();
  }
);
it('aborts pending native flush and makes dispose idempotent before source connection', async () => {
  const held = deferred();
  const owner = create(10);
  await add(owner, 10);
  FakeEncoder.current.onFlush = () => held.promise;
  const finished = owner.finish();
  await Promise.resolve();
  owner.dispose();
  owner.dispose();
  await expect(finished).rejects.toMatchObject({ name: 'AbortError' });
  held.resolve();
  expect(FakeEncoder.current.close).toHaveBeenCalledOnce();
  expect(closeSource).not.toHaveBeenCalled();
});

it('coalesces split 1025-frame content with silence and copies borrowed stereo samples', async () => {
  const owner = create(1025);
  const encoder = FakeEncoder.current;
  for (const [start, count] of [
    [0, 1000],
    [1000, 25],
  ]) {
    const data = new Float32Array(count! * 2);
    data.fill(0.25, 0, count);
    data.fill(-0.5, count);
    const input = new AudioSample({
      data,
      format: 'f32-planar',
      sampleRate: 48000,
      numberOfChannels: 2,
      timestamp: start! / 48000,
    });
    await owner.add(input);
    input.close();
    data.fill(99);
  }
  expect(encoder.frames).toHaveLength(0);
  encoder.onFlush = async () => {
    encoder.emit(0, 1024, aacConfig());
    encoder.emit(1024, 1024);
  };
  await owner.finish();
  expect(encoder.frames).toHaveLength(1);
  const frame = encoder.frames[0]!;
  expect(frame.numberOfFrames).toBe(5121);
  if (!(frame.data instanceof Float32Array)) throw new Error('Expected planar PCM');
  expect(frame.data.subarray(0, 1025).every((v) => v === 0.25)).toBe(true);
  expect(frame.data.subarray(5121, 6146).every((v) => v === -0.5)).toBe(true);
  expect(frame.data.subarray(1025, 5121).every((v) => v === 0)).toBe(true);
  expect(frame.data.subarray(6146).every((v) => v === 0)).toBe(true);
});
