import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { CanonicalAudioSource } from './source';
import { parseAudioWorkletProcessorMessage } from '@sniptale/runtime-contracts/audio-effects';
import type { AudioWorkletHostMessage } from '@sniptale/runtime-contracts/audio-effects';

const sourceMode = vi.hoisted(() => ({
  enabled: false,
  failRender: false,
  renders: [] as [number, number][],
}));
afterEach(() => {
  sourceMode.enabled = false;
  sourceMode.failRender = false;
  sourceMode.renders = [];
});

vi.mock('./assets', () => ({ prepareAudioProcessing: async () => ({}) }));
vi.mock('./prepare', () => ({
  createAudioProcessingRenderer: async (options: {
    source: CanonicalAudioSource;
    rate: number;
  }) => ({
    render: async (start: number, end: number) => {
      sourceMode.renders.push([start, end]);
      if (sourceMode.failRender) throw new Error('Controlled DSP failure');
      if (!sourceMode.enabled)
        return [Float32Array.from({ length: end - start }, (_, i) => start + i)];
      const planes = await options.source.read(start * options.rate, end * options.rate);
      return planes.map((plane) =>
        Float32Array.from({ length: end - start }, (_, i) => plane[i * options.rate]!)
      );
    },
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

async function prime(startFrame = 0) {
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
  processor.port.send({ kind: 'prime', generation: 1, startFrame });
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

it.each([19200, 24000])(
  'recovers a forwarded start at frame %s with sequential DSP and current PCM',
  async (startFrame) => {
    const processor = await prime();
    vi.stubGlobal('currentFrame', 1000);
    processor.port.send({
      kind: 'play',
      generation: 1,
      whenFrame: 1000,
      startFrame,
      endFrame: 48000,
    });
    const output = new Float32Array(128);
    expect(processor.process([], [[output]])).toBe(true);
    expect(output).toEqual(new Float32Array(128));
    let resumed = false;
    for (let clock = 1128; clock < 2280; clock += 128) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      vi.stubGlobal('currentFrame', clock);
      expect(processor.process([], [[output]])).toBe(true);
      if (!output.some((sample) => sample !== 0)) continue;
      expect(output).toEqual(
        Float32Array.from({ length: 128 }, (_, i) => startFrame + clock - 1000 + i)
      );
      resumed = true;
      break;
    }
    expect(resumed).toBe(true);
    expect(
      sourceMode.renders.every(
        ([start, end], index) => start === index * 4800 && end === start + 4800
      )
    ).toBe(true);
    expect(processor.port.messages).not.toContainEqual(expect.objectContaining({ kind: 'failed' }));
    processor.port.send({ kind: 'dispose', generation: 1 });
  }
);

it.each([
  { startFrame: 11999, endFrame: 48000 },
  { startFrame: 12000, endFrame: 48001 },
  { startFrame: 24000, endFrame: 24000 },
])('keeps an invalid forwarded playback interval fatal: %j', async ({ startFrame, endFrame }) => {
  const processor = await prime(12000);
  processor.port.send({ kind: 'play', generation: 1, whenFrame: 1000, startFrame, endFrame });
  expect(processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(processor.port.messages).toContainEqual({
    kind: 'failed',
    generation: 1,
    reason: 'protocol',
  });
});
it('recovers exhausted primed PCM after late Play without moving the clock or replaying stale audio', async () => {
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
  expect(processor.process([], [[output]])).toBe(true);
  expect(output).toEqual(new Float32Array(128));
  let resumed = false;
  for (let clock = 24128; clock < 25280; clock += 128) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    vi.stubGlobal('currentFrame', clock);
    expect(processor.process([], [[output]])).toBe(true);
    if (!output.some((sample) => sample !== 0)) continue;
    expect(output).toEqual(Float32Array.from({ length: 128 }, (_, i) => clock + i));
    resumed = true;
    break;
  }
  expect(resumed).toBe(true);
  expect(processor.port.messages).not.toContainEqual(expect.objectContaining({ kind: 'underrun' }));
  expect(processor.port.messages).not.toContainEqual(expect.objectContaining({ kind: 'failed' }));
  processor.port.send({ kind: 'dispose', generation: 1 });
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

async function starvedSource(rate: number) {
  if (!Constructor) throw new Error('Actual processor did not register.');
  sourceMode.enabled = true;
  vi.stubGlobal('currentFrame', 0);
  const processor = new Constructor();
  const pending: Extract<AudioWorkletHostMessage, { kind: 'source-reply' }>[] = [];
  let delayed = true;
  const intervals: number[] = [];
  processor.port.onPost = (value) => {
    const message = parseAudioWorkletProcessorMessage(value);
    if (!message || message.kind !== 'source-read') return;
    intervals.push(message.startFrame);
    const reply: Extract<AudioWorkletHostMessage, { kind: 'source-reply' }> = {
      kind: 'source-reply',
      generation: 1,
      requestId: message.requestId,
      planes: [
        Float32Array.from(
          { length: message.endFrame - message.startFrame },
          (_, i) => message.startFrame + i + 1
        ),
      ],
    };
    if (message.startFrame === 0 || !delayed) processor.port.send(reply);
    else pending.push(reply);
  };
  const ready = processor.port.wait('ready');
  processor.port.send({
    kind: 'initialize',
    generation: 1,
    channels: 1,
    sourceLengthFrames: 144000 * rate,
    durationFrames: 144000,
    rate,
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
  return {
    processor,
    pending,
    intervals,
    release() {
      delayed = false;
      for (const reply of pending.splice(0)) processor.port.send(reply);
    },
  };
}

it.each([1, 2])(
  'recovers a starved source at rate %s with current PCM and bounded sequential reads',
  async (rate) => {
    const fixture = await starvedSource(rate);
    const output = new Float32Array(128);
    let silentFrames = 0;
    const releaseFrame = Math.ceil((48000 / rate + 12000) / 128) * 128;
    for (let clock = 0; clock < releaseFrame; clock += 128) {
      vi.stubGlobal('currentFrame', clock);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(fixture.processor.process([], [[output]])).toBe(true);
      for (let i = 0; i < output.length; i++) {
        if (output[i] === 0) silentFrames++;
        else expect(output[i]).toBe((clock + i) * rate + 1);
      }
    }
    expect(silentFrames).toBeGreaterThan(0);
    expect(fixture.pending).toHaveLength(1);
    fixture.release();
    let resumed = false;
    for (let clock = releaseFrame; clock < releaseFrame + 4800; clock += 128) {
      vi.stubGlobal('currentFrame', clock);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(fixture.processor.process([], [[output]])).toBe(true);
      for (let i = 0; i < output.length; i++) {
        if (output[i] === 0) continue;
        resumed = true;
        expect(output[i]).toBe((clock + i) * rate + 1);
      }
    }
    expect(resumed).toBe(true);
    expect(fixture.intervals).toEqual(rate === 1 ? [0, 48000, 96000] : [0, 48000, 96000, 144000]);
    expect(fixture.processor.port.messages).not.toContainEqual(
      expect.objectContaining({ kind: 'underrun' })
    );
    expect(fixture.processor.port.messages).not.toContainEqual(
      expect.objectContaining({ kind: 'failed' })
    );
    fixture.processor.port.send({ kind: 'dispose', generation: 1 });
  }
);

it('ends at the exact clip boundary while starved and ignores the delayed source reply', async () => {
  const fixture = await starvedSource(1);
  vi.stubGlobal('currentFrame', 60000);
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(true);
  vi.stubGlobal('currentFrame', 143936);
  const output = new Float32Array(128);
  expect(fixture.processor.process([], [[output]])).toBe(false);
  expect(output).toEqual(new Float32Array(128));
  expect(fixture.processor.port.messages).toContainEqual({ kind: 'ended', generation: 1 });
  const count = fixture.processor.port.messages.length;
  fixture.release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(fixture.processor.port.messages).toHaveLength(count);
});

it('cancels during starvation without publishing late PCM or a failure', async () => {
  const fixture = await starvedSource(1);
  vi.stubGlobal('currentFrame', 60000);
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(true);
  fixture.processor.port.send({ kind: 'dispose', generation: 1 });
  const count = fixture.processor.port.messages.length;
  fixture.release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(fixture.processor.port.messages).toHaveLength(count);
});

it('keeps source errors fatal during starvation', async () => {
  const fixture = await starvedSource(1);
  vi.stubGlobal('currentFrame', 60000);
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(true);
  const pending = fixture.pending[0];
  if (!pending) throw new Error('Expected a pending source page');
  fixture.processor.port.send({
    kind: 'source-error',
    generation: 1,
    requestId: pending.requestId,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  fixture.processor.process([], [[new Float32Array(128)]]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(fixture.processor.port.messages).toContainEqual(
    expect.objectContaining({ kind: 'failed' })
  );
});

it('keeps DSP failures fatal after the buffered output is exhausted', async () => {
  const processor = await prime();
  processor.port.send({
    kind: 'play',
    generation: 1,
    whenFrame: 0,
    startFrame: 0,
    endFrame: 48000,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  sourceMode.failRender = true;
  vi.stubGlobal('currentFrame', 24000);
  expect(processor.process([], [[new Float32Array(128)]])).toBe(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(processor.port.messages).toContainEqual({
    kind: 'failed',
    generation: 1,
    reason: 'render',
  });
});

it('keeps invalid protocol messages fatal during starvation', async () => {
  const fixture = await starvedSource(1);
  vi.stubGlobal('currentFrame', 60000);
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(true);
  fixture.processor.port.onmessage?.(new MessageEvent('message', { data: { kind: 'unknown' } }));
  expect(fixture.processor.process([], [[new Float32Array(128)]])).toBe(false);
  expect(fixture.processor.port.messages).toContainEqual({
    kind: 'failed',
    generation: 1,
    reason: 'protocol',
  });
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
