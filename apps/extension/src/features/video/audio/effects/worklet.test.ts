import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { CanonicalAudioSource } from './source';
import { parseAudioWorkletProcessorMessage } from '@sniptale/runtime-contracts/audio-effects';
import type { AudioWorkletHostMessage } from '@sniptale/runtime-contracts/audio-effects';

const sourceMode = vi.hoisted(() => ({ enabled: false }));
afterEach(() => {
  sourceMode.enabled = false;
});

vi.mock('./assets', () => ({ prepareAudioProcessing: async () => ({}) }));
vi.mock('./prepare', () => ({
  createAudioProcessingRenderer: async (options: { source: CanonicalAudioSource }) => ({
    render: async (start: number, end: number) =>
      sourceMode.enabled
        ? options.source.read(start, end)
        : [Float32Array.from({ length: end - start }, (_, i) => start + i)],
    dispose: vi.fn(() => options.source.dispose()),
  }),
}));

class Port {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  messages: unknown[] = [];
  onPost?: (message: unknown) => void;
  private listeners = new Map<string, () => void>();
  postMessage(message: unknown) {
    this.messages.push(message);
    this.onPost?.(message);
    if (
      typeof message === 'object' &&
      message !== null &&
      'kind' in message &&
      typeof message.kind === 'string'
    )
      this.listeners.get(message.kind)?.();
  }
  close() {}
  wait(kind: string) {
    return new Promise<void>((resolve) => this.listeners.set(kind, resolve));
  }
  send(message: AudioWorkletHostMessage) {
    this.onmessage?.(new MessageEvent('message', { data: message }));
  }
}
interface Processor {
  port: Port;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
let Constructor: (new () => Processor) | undefined;
beforeAll(async () => {
  vi.stubGlobal('sampleRate', 48000);
  vi.stubGlobal('currentFrame', 0);
  vi.stubGlobal(
    'AudioWorkletProcessor',
    class {
      port = new Port();
    }
  );
  vi.stubGlobal('registerProcessor', (_name: string, factory: new () => Processor) => {
    Constructor = factory;
  });
  await import('./worklet');
});
afterAll(() => vi.unstubAllGlobals());

async function prime() {
  if (!Constructor) throw new Error('Actual processor did not register.');
  vi.stubGlobal('currentFrame', 0);
  const processor = new Constructor();
  const ready = processor.port.wait('ready');
  processor.port.send({
    kind: 'initialize',
    generation: 1,
    channels: 1,
    sourceLengthFrames: 48000,
    durationFrames: 48000,
    rate: 1,
    processing: { version: 1, bypassed: false, effects: [] },
    assets: {},
  });
  await ready;
  const primed = processor.port.wait('primed');
  processor.port.send({ kind: 'prime', generation: 1, startFrame: 0 });
  await primed;
  return processor;
}
it('accepts delayed Play delivery and advances PCM to the original audio-clock position', async () => {
  const processor = await prime();
  vi.stubGlobal('currentFrame', 1256);
  processor.port.send({
    kind: 'play',
    generation: 1,
    whenFrame: 1000,
    startFrame: 100,
    endFrame: 48000,
  });
  const output = new Float32Array(128);
  expect(processor.process([], [[output]])).toBe(true);
  expect(output).toEqual(Float32Array.from({ length: 128 }, (_, i) => 356 + i));
  expect(processor.port.messages).not.toContainEqual(expect.objectContaining({ kind: 'failed' }));
  processor.port.send({ kind: 'dispose', generation: 1 });
});
it('keeps future Play silent until the scheduled sample without changing its source position', async () => {
  const processor = await prime();
  vi.stubGlobal('currentFrame', 1000);
  processor.port.send({
    kind: 'play',
    generation: 1,
    whenFrame: 1024,
    startFrame: 100,
    endFrame: 48000,
  });
  const output = new Float32Array(128);
  expect(processor.process([], [[output]])).toBe(true);
  expect(output.subarray(0, 24)).toEqual(new Float32Array(24));
  expect(output.subarray(24)).toEqual(Float32Array.from({ length: 104 }, (_, i) => 100 + i));
  processor.port.send({ kind: 'dispose', generation: 1 });
});
it('reports exhausted primed PCM as underrun without replaying stale audio after very late Play', async () => {
  const processor = await prime();
  vi.stubGlobal('currentFrame', 24000);
  processor.port.send({
    kind: 'play',
    generation: 1,
    whenFrame: 0,
    startFrame: 0,
    endFrame: 48000,
  });
  const output = new Float32Array(128);
  expect(processor.process([], [[output]])).toBe(false);
  expect(output).toEqual(new Float32Array(128));
  expect(processor.port.messages).toContainEqual({ kind: 'underrun', generation: 1, frame: 24000 });
  expect(processor.port.messages).not.toContainEqual(expect.objectContaining({ kind: 'failed' }));
});

it('keeps playback filled across a controlled half-second source bridge delay with bounded lookahead', async () => {
  if (!Constructor) throw new Error('Actual processor did not register.');
  sourceMode.enabled = true;
  vi.stubGlobal('currentFrame', 0);
  const processor = new Constructor();
  const delayed: { readyFrame: number; requestId: number; frames: number }[] = [];
  let clock = 0,
    reads = 0;
  processor.port.onPost = (value) => {
    const message = parseAudioWorkletProcessorMessage(value);
    if (!message || message.kind !== 'source-read') return;
    reads++;
    if (message.startFrame === 0)
      processor.port.send({
        kind: 'source-reply',
        generation: 1,
        requestId: message.requestId,
        planes: [new Float32Array(message.endFrame - message.startFrame).fill(0.25)],
      });
    else
      delayed.push({
        readyFrame: clock + 24000,
        requestId: message.requestId,
        frames: message.endFrame - message.startFrame,
      });
  };
  const ready = processor.port.wait('ready');
  processor.port.send({
    kind: 'initialize',
    generation: 1,
    channels: 1,
    sourceLengthFrames: 144000,
    durationFrames: 144000,
    rate: 1,
    processing: { version: 1, bypassed: false, effects: [] },
    assets: {},
  });
  await ready;
  const primed = processor.port.wait('primed');
  processor.port.send({ kind: 'prime', generation: 1, startFrame: 0 });
  await primed;
  processor.port.send({
    kind: 'play',
    generation: 1,
    whenFrame: 0,
    startFrame: 0,
    endFrame: 144000,
  });
  let failedAt: number | undefined;
  for (clock = 0; clock <= 144000; clock += 128) {
    vi.stubGlobal('currentFrame', clock);
    for (const item of [...delayed]) {
      if (item.readyFrame > clock) continue;
      delayed.splice(delayed.indexOf(item), 1);
      processor.port.send({
        kind: 'source-reply',
        generation: 1,
        requestId: item.requestId,
        planes: [new Float32Array(item.frames).fill(0.25)],
      });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    const output = new Float32Array(128);
    const alive = processor.process([], [[output]]);
    if (!alive && clock < 144000) {
      failedAt = clock;
      break;
    }
    if (clock < 144000) expect(output.every((value) => value === 0.25)).toBe(true);
  }
  expect(failedAt).toBeUndefined();
  const messages = processor.port.messages.map(parseAudioWorkletProcessorMessage);
  expect(messages.some((message) => message?.kind === 'underrun')).toBe(false);
  expect(messages.some((message) => message?.kind === 'ended')).toBe(true);
  expect(reads).toBe(3);
});

it('cancels an outstanding prefetched page and ignores its late reply', async () => {
  if (!Constructor) throw new Error('Actual processor did not register.');
  sourceMode.enabled = true;
  vi.stubGlobal('currentFrame', 0);
  const processor = new Constructor();
  let pending:
    | Extract<
        NonNullable<ReturnType<typeof parseAudioWorkletProcessorMessage>>,
        { kind: 'source-read' }
      >
    | undefined;
  processor.port.onPost = (value) => {
    const message = parseAudioWorkletProcessorMessage(value);
    if (!message || message.kind !== 'source-read') return;
    if (message.startFrame === 0)
      processor.port.send({
        kind: 'source-reply',
        generation: 1,
        requestId: message.requestId,
        planes: [new Float32Array(message.endFrame - message.startFrame).fill(0.25)],
      });
    else pending = message;
  };
  const ready = processor.port.wait('ready');
  processor.port.send({
    kind: 'initialize',
    generation: 1,
    channels: 1,
    sourceLengthFrames: 96000,
    durationFrames: 96000,
    rate: 1,
    processing: { version: 1, bypassed: false, effects: [] },
    assets: {},
  });
  await ready;
  const primed = processor.port.wait('primed');
  processor.port.send({ kind: 'prime', generation: 1, startFrame: 0 });
  await primed;
  expect(pending).toMatchObject({ startFrame: 48000, endFrame: 96000 });
  const request = pending;
  if (!request) throw new Error('Expected pending source page');
  processor.port.send({ kind: 'dispose', generation: 1 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const count = processor.port.messages.length;
  processor.port.send({
    kind: 'source-reply',
    generation: 1,
    requestId: request.requestId,
    planes: [new Float32Array(48000)],
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(processor.port.messages).toHaveLength(count);
});
