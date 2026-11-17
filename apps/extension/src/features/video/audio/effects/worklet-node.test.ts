import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAudioProcessingWorklet } from './worklet-node';
import { createAudioEffectInstance } from './catalog';
import type { AudioProcessing } from '@sniptale/runtime-contracts/audio-effects';

class Context extends EventTarget {
  sampleRate = 48000;
  state: AudioContextState = 'running';
  currentTime = 1;
  destination = {};
  audioWorklet = { addModule: vi.fn(async () => {}) };
  close = vi.fn();
  gains: {
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  createGain() {
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  }
}
class Node {
  static instances: Node[] = [];
  connect = vi.fn();
  disconnect = vi.fn();
  onprocessorerror: (() => void) | null = null;
  port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    close: vi.fn(),
    postMessage: vi.fn((message: { kind: string; generation: number; startFrame?: number }) => {
      if (message.kind === 'initialize')
        queueMicrotask(() => this.emit({ kind: 'ready', generation: message.generation }));
    }),
  };
  constructor() {
    Node.instances.push(this);
  }
  emit(data: unknown) {
    this.port.onmessage?.({ data });
  }
}
beforeEach(() => {
  Node.instances = [];
  vi.stubGlobal('AudioWorkletNode', Node);
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const context = new Context(),
    controller = new AbortController();
  const source = {
    channels: 1 as const,
    lengthFrames: 48000,
    dispose: vi.fn(),
    read: vi.fn(async (start: number, end: number) => [new Float32Array(end - start).fill(0.25)]),
  };
  const processing: AudioProcessing = { version: 1, bypassed: false, effects: [] };
  return {
    context,
    controller,
    source,
    options: {
      context: context as unknown as AudioContext,
      source,
      processing,
      rate: 1,
      durationFrames: 48000,
      generation: 3,
      signal: controller.signal,
      onEnded: vi.fn(),
      onError: vi.fn(),
    },
  };
}
it.each([44100, 96000])(
  'refuses a %s Hz caller before loading code or taking source ownership',
  async (sampleRate) => {
    const f = fixture();
    f.context.sampleRate = sampleRate;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(createAudioProcessingWorklet(f.options)).rejects.toThrow('48 kHz');
    expect(fetch).not.toHaveBeenCalled();
    expect(f.context.audioWorklet.addModule).not.toHaveBeenCalled();
    expect(Node.instances).toHaveLength(0);
    expect(f.source.dispose).not.toHaveBeenCalled();
    expect(f.context.close).not.toHaveBeenCalled();
  }
);
it('refuses an initially suspended context before reader ownership transfers', async () => {
  const f = fixture();
  f.context.state = 'suspended';
  await expect(createAudioProcessingWorklet(f.options)).rejects.toThrow('running');
  expect(f.source.dispose).not.toHaveBeenCalled();
});
it('primes before playback and disposes only the placement resources', async () => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  expect(f.context.audioWorklet.addModule).toHaveBeenCalledWith(expect.any(URL));
  expect(f.context.gains[0]!.gain.value).toBe(0);
  expect(() => handle.start(1.1)).toThrow('invalid');
  const primed = handle.prime(12000);
  node.emit({ kind: 'primed', generation: 2, startFrame: 12000, bufferedFrames: 19200 });
  node.emit({ kind: 'primed', generation: 3, startFrame: 12000, bufferedFrames: 19200 });
  await primed;
  handle.start(1.1, 24000);
  expect(node.port.postMessage).toHaveBeenCalledWith(
    { kind: 'play', generation: 3, whenFrame: 52801, startFrame: 12000, endFrame: 24000 },
    []
  );
  handle.dispose();
  handle.dispose();
  expect(f.source.dispose).toHaveBeenCalledTimes(1);
  expect(node.disconnect).toHaveBeenCalledTimes(1);
  expect(node.port.close).toHaveBeenCalledTimes(1);
  expect(f.context.close).not.toHaveBeenCalled();
});
it('copies borrowed canonical pages before transferring them to the Worklet', async () => {
  const f = fixture(),
    planes = [new Float32Array(128).fill(0.25)];
  f.source.read.mockResolvedValue(planes);
  const handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  try {
    node.emit({ kind: 'source-read', generation: 3, requestId: 1, startFrame: 0, endFrame: 128 });
    await vi.waitFor(() => expect(node.port.postMessage).toHaveBeenCalledTimes(2));
    const reply: unknown = node.port.postMessage.mock.calls[1]![0];
    const { parseAudioWorkletHostMessage } =
      await import('@sniptale/runtime-contracts/audio-effects');
    const parsed = parseAudioWorkletHostMessage(reply);
    if (parsed?.kind !== 'source-reply') throw new Error('Missing source reply');
    expect(parsed.planes).toEqual(planes);
    expect(parsed.planes[0]).not.toBe(planes[0]);
    expect(planes[0]!.length).toBe(128);
  } finally {
    handle.dispose();
  }
});
it('cancels a pending prime and discards a controlled late source reply', async () => {
  const f = fixture();
  let resolve!: (value: Float32Array<ArrayBuffer>[]) => void;
  f.source.read.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  const primed = handle.prime(0),
    rejected = expect(primed).rejects.toThrow('cancelled');
  node.emit({ kind: 'source-read', generation: 3, requestId: 1, startFrame: 0, endFrame: 128 });
  f.controller.abort();
  await rejected;
  const count = node.port.postMessage.mock.calls.length;
  resolve([new Float32Array(128)]);
  await Promise.resolve();
  await Promise.resolve();
  expect(node.port.postMessage).toHaveBeenCalledTimes(count);
  expect(f.source.dispose).toHaveBeenCalledTimes(1);
  expect(f.context.close).not.toHaveBeenCalled();
});
it('rejects pending preparation when the borrowed context is suspended', async () => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options);
  const pending = handle.prime(0),
    rejected = expect(pending).rejects.toThrow('context stopped');
  f.context.state = 'suspended';
  f.context.dispatchEvent(new Event('statechange'));
  await rejected;
  expect(f.source.dispose).toHaveBeenCalledTimes(1);
  expect(f.context.close).not.toHaveBeenCalled();
});
it('reports an active underrun and stops instead of playing an unprocessed replacement', async () => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  const primed = handle.prime(0);
  node.emit({ kind: 'primed', generation: 3, startFrame: 0, bufferedFrames: 19200 });
  await primed;
  handle.start(1.1);
  node.emit({ kind: 'underrun', generation: 3, frame: 128 });
  expect(f.options.onError).toHaveBeenCalledTimes(1);
  expect(f.source.dispose).toHaveBeenCalledTimes(1);
  expect(f.options.onEnded).not.toHaveBeenCalled();
  expect(f.context.close).not.toHaveBeenCalled();
});
it('refuses invalid fixed assets and releases the admitted source without creating a node', async () => {
  const f = fixture();
  f.options.processing.effects = [
    createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1'),
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(1)))
  );
  await expect(createAudioProcessingWorklet(f.options)).rejects.toThrow('size differs');
  expect(f.source.dispose).toHaveBeenCalledTimes(1);
  expect(Node.instances).toHaveLength(0);
  expect(f.context.close).not.toHaveBeenCalled();
});
it('keeps the original audio clock when the main thread reaches start after its scheduled deadline', async () => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  const primed = handle.prime(0);
  node.emit({ kind: 'primed', generation: 3, startFrame: 0, bufferedFrames: 19200 });
  await primed;
  const when = f.context.currentTime + 256 / 48000;
  f.context.currentTime += 0.02;
  expect(() => handle.start(when, 24000)).not.toThrow();
  expect(node.port.postMessage).toHaveBeenLastCalledWith(
    {
      kind: 'play',
      generation: 3,
      whenFrame: Math.ceil(when * 48000),
      startFrame: 0,
      endFrame: 24000,
    },
    []
  );
  expect(f.options.onError).not.toHaveBeenCalled();
  handle.dispose();
});

it('still refuses negative, nonfinite and unsafe audio clock intervals after priming', async () => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  const primed = handle.prime(0);
  node.emit({ kind: 'primed', generation: 3, startFrame: 0, bufferedFrames: 19200 });
  await primed;
  for (const when of [-0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => handle.start(when, 24000)).toThrow('invalid');
  handle.dispose();
});

it.each([19200, 24000])(
  'admits a refreshed start at frame %s beyond the initial primed PCM',
  async (startFrame) => {
    const f = fixture(),
      handle = await createAudioProcessingWorklet(f.options),
      node = Node.instances[0]!;
    const primed = handle.prime(0);
    node.emit({ kind: 'primed', generation: 3, startFrame: 0, bufferedFrames: 19200 });
    await primed;
    expect(() => handle.start(1.1, 48000, startFrame)).not.toThrow();
    expect(node.port.postMessage).toHaveBeenLastCalledWith(
      { kind: 'play', generation: 3, whenFrame: 52801, startFrame, endFrame: 48000 },
      []
    );
    expect(f.options.onError).not.toHaveBeenCalled();
    handle.dispose();
  }
);

it.each([
  { startFrame: 11999, endFrame: 48000 },
  { startFrame: 12000, endFrame: 48001 },
  { startFrame: 24000, endFrame: 24000 },
])('refuses an invalid refreshed playback interval %j', async ({ startFrame, endFrame }) => {
  const f = fixture(),
    handle = await createAudioProcessingWorklet(f.options),
    node = Node.instances[0]!;
  const primed = handle.prime(12000);
  node.emit({ kind: 'primed', generation: 3, startFrame: 12000, bufferedFrames: 19200 });
  await primed;
  expect(() => handle.start(1.1, endFrame, startFrame)).toThrow('invalid');
  expect(
    node.port.postMessage.mock.calls.filter(([message]) => message.kind === 'play')
  ).toHaveLength(0);
  handle.dispose();
});
