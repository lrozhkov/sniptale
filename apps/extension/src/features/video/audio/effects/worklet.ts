import {
  AUDIO_WORKLET_SAMPLE_RATE,
  AUDIO_WORKLET_SOURCE_PAGE_FRAMES,
  AUDIO_WORKLET_OUTPUT_CHUNK_FRAMES,
  AUDIO_WORKLET_OUTPUT_QUEUE_CHUNKS,
  parseAudioWorkletHostMessage,
  type AudioWorkletHostMessage,
  type AudioWorkletProcessorMessage,
} from '@sniptale/runtime-contracts/audio-effects';
import { prepareAudioProcessing } from './assets';
import { createAudioProcessingRenderer, type AudioProcessingRenderer } from './prepare';
import type { CanonicalAudioSource } from './source';

declare const currentFrame: number;
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
type Initialization = Extract<AudioWorkletHostMessage, { kind: 'initialize' }>;
interface Chunk {
  start: number;
  end: number;
  planes: Float32Array[];
}
interface PendingRead {
  frames: number;
  resolve(planes: Float32Array[]): void;
  reject(error: Error): void;
}

/** Dedicated processor lifetime. Graph transport, decoding and project edits remain with the host. */
class ProcessingWorklet extends AudioWorkletProcessor {
  private generation = 0;
  private closed = false;
  private phase: 'new' | 'preparing' | 'ready' | 'priming' | 'primed' | 'playing' = 'new';
  private channels: 1 | 2 = 1;
  private duration = 0;
  private renderer?: AudioProcessingRenderer;
  private readonly reads = new Map<number, PendingRead>();
  private nextRead = 0;
  private readonly yields = new Set<() => void>();
  private chunks: Chunk[] = [];
  private cursor = 0;
  private primeStart = 0;
  private end = 0;
  private when = 0;
  private pumping = false;
  private sliceStart = Date.now();

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      void this.receive(event.data).catch(() => this.fail('prepare'));
    };
  }
  private send(message: AudioWorkletProcessorMessage) {
    if (!this.closed) this.port.postMessage(message);
  }
  private check() {
    if (this.closed) throw new Error('Audio processing placement is closed.');
  }
  private release() {
    if (this.closed) return;
    this.closed = true;
    for (const read of this.reads.values())
      read.reject(new Error('Audio processing source read cancelled.'));
    this.reads.clear();
    for (const resume of this.yields) resume();
    this.yields.clear();
    this.chunks = [];
    try {
      this.renderer?.dispose();
    } finally {
      this.port.onmessage = null;
      this.port.close();
    }
  }
  private fail(reason: 'protocol' | 'prepare' | 'source' | 'render') {
    if (this.closed) return;
    if (this.generation) this.send({ kind: 'failed', generation: this.generation, reason });
    this.release();
  }
  private async receive(value: unknown) {
    if (this.closed) return;
    const message = parseAudioWorkletHostMessage(value);
    if (!message) {
      this.fail('protocol');
      return;
    }
    if (this.phase === 'new') {
      this.generation = message.generation;
      if (message.kind !== 'initialize' || sampleRate !== AUDIO_WORKLET_SAMPLE_RATE) {
        this.fail('protocol');
        return;
      }
      this.phase = 'preparing';
      await this.initialize(message);
      return;
    }
    if (message.generation !== this.generation) return;
    if (message.kind === 'dispose') {
      this.release();
      return;
    }
    if (message.kind === 'source-reply' || message.kind === 'source-error') {
      const pending = this.reads.get(message.requestId);
      if (!pending) {
        this.fail('protocol');
        return;
      }
      this.reads.delete(message.requestId);
      if (message.kind === 'source-error') {
        pending.reject(new Error('Audio processing source is unavailable.'));
        return;
      }
      if (message.planes.length !== this.channels || message.planes[0]!.length !== pending.frames) {
        pending.reject(new Error('Audio processing source interval differs.'));
        this.fail('source');
        return;
      }
      pending.resolve(message.planes);
      return;
    }
    if (message.kind === 'prime' && this.phase === 'ready' && message.startFrame <= this.duration) {
      this.primeStart = this.cursor = message.startFrame;
      this.end = this.duration;
      this.phase = 'priming';
      this.pump();
      return;
    }
    if (
      message.kind === 'play' &&
      this.phase === 'primed' &&
      message.startFrame >= this.primeStart &&
      message.endFrame <= this.duration
    ) {
      // MessagePort delivery can miss the scheduled quantum. Keep the original clock;
      // process() skips elapsed PCM and stays silent while missing processed PCM catches up.
      this.when = message.whenFrame;
      this.primeStart = message.startFrame;
      this.end = message.endFrame;
      this.phase = 'playing';
      this.pump();
      return;
    }
    this.fail('protocol');
  }
  private async initialize(message: Initialization) {
    this.channels = message.channels;
    this.duration = message.durationFrames;
    const assets = new Map(Object.entries(message.assets));
    try {
      const processors = await prepareAudioProcessing(message.processing, {
        checkCancelled: () => this.check(),
        readAsset: async (descriptor) => {
          const bytes = assets.get(descriptor.path);
          if (!bytes) throw new Error('Fixed audio asset is missing.');
          return bytes;
        },
      });
      this.check();
      this.renderer = await createAudioProcessingRenderer({
        source: this.source(message.sourceLengthFrames),
        processors,
        rate: message.rate,
        durationFrames: message.durationFrames,
        checkCancelled: () => this.check(),
        cooperate: async () => {
          this.check();
          if (Date.now() - this.sliceStart < 1) return;
          await new Promise<void>((resolve) => this.yields.add(resolve));
          this.sliceStart = Date.now();
          this.check();
        },
      });
      this.check();
      this.phase = 'ready';
      this.send({ kind: 'ready', generation: this.generation });
    } finally {
      assets.clear();
    }
  }
  private source(lengthFrames: number): CanonicalAudioSource {
    const pages = new Map<number, Promise<Float32Array[]>>();
    let disposed = false;
    const check = () => {
      this.check();
      if (disposed) throw new Error('Audio source is disposed.');
    };
    const page = (index: number) => {
      const previous = pages.get(index);
      if (previous) return previous;
      const startFrame = index * AUDIO_WORKLET_SOURCE_PAGE_FRAMES;
      const endFrame = Math.min(lengthFrames, startFrame + AUDIO_WORKLET_SOURCE_PAGE_FRAMES);
      const requestId = ++this.nextRead;
      const pending = new Promise<Float32Array[]>((resolve, reject) => {
        this.reads.set(requestId, { frames: endFrame - startFrame, resolve, reject });
        this.send({
          kind: 'source-read',
          generation: this.generation,
          requestId,
          startFrame,
          endFrame,
        });
      });
      pages.set(index, pending);
      while (pages.size > 2) pages.delete(pages.keys().next().value!);
      return pending;
    };
    return {
      channels: this.channels,
      lengthFrames,
      read: async (start, end) => {
        check();
        const output = Array.from({ length: this.channels }, () => new Float32Array(end - start));
        const stop = Math.min(lengthFrames, end);
        for (let first = Math.max(0, start); first < stop;) {
          const index = Math.floor(first / AUDIO_WORKLET_SOURCE_PAGE_FRAMES);
          const last = Math.min(stop, (index + 1) * AUDIO_WORKLET_SOURCE_PAGE_FRAMES);
          const planes = await page(index);
          check();
          const next = index + 1;
          // Decode the next bounded page while this one plays, before its deadline arrives.
          if (next * AUDIO_WORKLET_SOURCE_PAGE_FRAMES < lengthFrames && !pages.has(next))
            void page(next).catch(() => undefined);
          for (let channel = 0; channel < this.channels; channel++)
            output[channel]!.set(
              planes[channel]!.subarray(
                first - index * AUDIO_WORKLET_SOURCE_PAGE_FRAMES,
                last - index * AUDIO_WORKLET_SOURCE_PAGE_FRAMES
              ),
              first - start
            );
          first = last;
        }
        return output;
      },
      dispose() {
        disposed = true;
        pages.clear();
      },
    };
  }
  private pump() {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    void this.fill()
      .catch(() => this.fail('render'))
      .finally(() => {
        this.pumping = false;
      });
  }
  private async fill() {
    while (
      !this.closed &&
      this.chunks.length < AUDIO_WORKLET_OUTPUT_QUEUE_CHUNKS &&
      this.cursor < this.end
    ) {
      const start = this.cursor,
        end = Math.min(this.end, start + AUDIO_WORKLET_OUTPUT_CHUNK_FRAMES);
      const renderer = this.renderer;
      if (!renderer) throw new Error('Audio renderer is not prepared.');
      const planes = await renderer.render(start, end);
      this.check();
      // Advance DSP state sequentially, but do not retain PCM whose playback time has passed.
      if (this.phase !== 'playing' || end > this.primeStart + currentFrame - this.when)
        this.chunks.push({ start, end, planes });
      this.cursor = end;
    }
    if (
      this.phase === 'priming' &&
      (this.chunks.length === AUDIO_WORKLET_OUTPUT_QUEUE_CHUNKS || this.cursor === this.end)
    ) {
      this.phase = 'primed';
      this.send({
        kind: 'primed',
        generation: this.generation,
        startFrame: this.primeStart,
        bufferedFrames: this.chunks.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0),
      });
    }
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0];
    if (!output) {
      this.fail('protocol');
      return false;
    }
    for (const plane of output) plane.fill(0);
    if (this.closed) return false;
    if (this.phase === 'new') return true;
    if (output.length !== this.channels) {
      this.fail('protocol');
      return false;
    }
    for (const resume of this.yields) resume();
    this.yields.clear();
    this.sliceStart = Date.now();
    if (this.closed) return false;
    if (this.phase !== 'playing') return true;
    for (let index = 0; index < output[0]!.length; index++) {
      if (currentFrame + index < this.when) continue;
      const frame = this.primeStart + currentFrame + index - this.when;
      if (frame >= this.end) {
        this.send({ kind: 'ended', generation: this.generation });
        this.release();
        return false;
      }
      while (this.chunks[0] && frame >= this.chunks[0].end) this.chunks.shift();
      const chunk = this.chunks[0];
      if (!chunk || frame < chunk.start) {
        // Missing PCM stays silent. The audio clock and clip boundary continue to advance.
        continue;
      }
      for (let channel = 0; channel < this.channels; channel++)
        output[channel]![index] = chunk.planes[channel]![frame - chunk.start]!;
    }
    this.pump();
    return true;
  }
}
registerProcessor('sniptale-audio-processing-v1', ProcessingWorklet);
