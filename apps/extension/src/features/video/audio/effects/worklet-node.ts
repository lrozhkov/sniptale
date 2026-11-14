import { audioRuntimeAssetUrl, readAudioRuntimeAsset } from './browser-assets';
import {
  AUDIO_WORKLET_SAMPLE_RATE,
  parseAudioProcessing,
  parseAudioWorkletProcessorMessage,
  type AudioProcessing,
  type AudioWorkletHostMessage,
} from '@sniptale/runtime-contracts/audio-effects';
import { AUDIO_DSP_ASSETS, getFaustModule, unavailableAudioProcessor } from './catalog';
import type { CanonicalAudioSource } from './source';

export interface AudioProcessingWorklet {
  /** The caller connects its existing gain/fade/mix graph to this output. */
  readonly output: AudioNode;
  prime(startFrame: number): Promise<void>;
  start(when: number, endFrame?: number, startFrame?: number): void;
  dispose(): void;
}
interface WorkletOptions {
  context: AudioContext;
  source: CanonicalAudioSource;
  processing: AudioProcessing;
  rate: number;
  durationFrames: number;
  generation: number;
  signal: AbortSignal;
  onEnded(): void;
  /** The transport must pause/reprepare on failure; it must not keep playing dry audio. */
  onError(error: Error): void;
}

/** Requires a running 48 kHz context. After admission, owns the reader and node, never the context. */
export async function createAudioProcessingWorklet(
  options: WorkletOptions
): Promise<AudioProcessingWorklet> {
  const { context, source, signal } = options;
  signal.throwIfAborted();
  if (context.sampleRate !== AUDIO_WORKLET_SAMPLE_RATE || context.state !== 'running')
    throw new Error('Audio processing requires a running 48 kHz context.');
  const processing = parseAudioProcessing(options.processing);
  if (
    !processing ||
    unavailableAudioProcessor(processing) ||
    !Number.isSafeInteger(options.generation) ||
    options.generation <= 0 ||
    !Number.isSafeInteger(options.durationFrames) ||
    options.durationFrames < 0 ||
    !Number.isFinite(options.rate) ||
    options.rate < 1 / 16 ||
    options.rate > 16 ||
    (source.channels !== 1 && source.channels !== 2) ||
    !Number.isSafeInteger(source.lengthFrames) ||
    source.lengthFrames < 0
  )
    throw new Error('Audio processing placement is invalid or unavailable.');
  const loading = new AbortController();
  let node: AudioWorkletNode | undefined, keepAlive: GainNode | undefined;
  let closed = false,
    phase: 'loading' | 'ready' | 'priming' | 'primed' | 'playing' = 'loading';
  let primeStart = 0,
    bufferedEnd = 0;
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  // Preparation can fail before a node exists. Install its rejection handler immediately.
  void ready.catch(() => {});
  let primeResolve: (() => void) | undefined, primeReject: ((error: Error) => void) | undefined;
  const reading = new Set<number>();
  const check = () => {
    signal.throwIfAborted();
    if (closed) throw new Error('Audio processing placement is closed.');
  };
  const post = (message: AudioWorkletHostMessage, transfer: Transferable[] = []) => {
    check();
    if (!node) throw new Error('Audio processing node is unavailable.');
    node.port.postMessage(message, transfer);
  };
  function dispose() {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', abort);
    context.removeEventListener('statechange', stateChanged);
    loading.abort();
    const error = new Error('Audio processing placement cancelled.');
    readyReject(error);
    primeReject?.(error);
    primeResolve = primeReject = undefined;
    reading.clear();
    try {
      if (node) {
        node.port.postMessage({
          kind: 'dispose',
          generation: options.generation,
        } satisfies AudioWorkletHostMessage);
        node.port.onmessage = null;
        node.onprocessorerror = null;
        node.port.close();
        node.disconnect();
      }
    } finally {
      try {
        keepAlive?.disconnect();
      } finally {
        source.dispose();
      }
    }
  }
  function fail(error: Error) {
    if (closed) return;
    const notify = phase === 'playing';
    readyReject(error);
    primeReject?.(error);
    try {
      dispose();
    } finally {
      if (notify) options.onError(error);
    }
  }
  function abort() {
    dispose();
  }
  function stateChanged() {
    if (context.state !== 'running') fail(new Error('Audio processing context stopped.'));
  }
  signal.addEventListener('abort', abort, { once: true });
  context.addEventListener('statechange', stateChanged);
  try {
    check();
    const paths = new Set<string>();
    if (!processing.bypassed) {
      if (processing.denoise?.enabled) paths.add('audio-effects/rnnoise.wasm');
      for (const effect of processing.effects)
        if (effect.enabled && effect.wet > 0) paths.add(getFaustModule(effect.kind).path);
    }
    const assets: Record<string, Uint8Array<ArrayBuffer>> = {};
    await Promise.all(
      [...paths].map(async (path) => {
        const descriptor = AUDIO_DSP_ASSETS.files.find((file) => file.path === path);
        if (!descriptor) throw new Error('Fixed audio asset is unavailable.');
        assets[path] = await readAudioRuntimeAsset(descriptor, loading.signal);
        check();
      })
    );
    check();
    await context.audioWorklet.addModule(audioRuntimeAssetUrl('audio-effects/worklet.mjs'));
    check();
    if (context.state !== 'running') throw new Error('Audio processing context stopped.');
    node = new AudioWorkletNode(context, 'sniptale-audio-processing-v1', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [source.channels],
    });
    keepAlive = context.createGain();
    keepAlive.gain.value = 0;
    node.connect(keepAlive);
    keepAlive.connect(context.destination);
    node.onprocessorerror = () => fail(new Error('Audio processing failed.'));
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (closed) return;
      const message = parseAudioWorkletProcessorMessage(event.data);
      if (!message) {
        fail(new Error('Audio processing protocol failed.'));
        return;
      }
      if (message.generation !== options.generation) return;
      if (message.kind === 'ready' && phase === 'loading') {
        phase = 'ready';
        readyResolve();
        return;
      }
      if (message.kind === 'primed' && phase === 'priming' && message.startFrame === primeStart) {
        bufferedEnd = message.startFrame + message.bufferedFrames;
        phase = 'primed';
        primeResolve?.();
        primeResolve = primeReject = undefined;
        return;
      }
      if (message.kind === 'ended' && phase === 'playing') {
        try {
          dispose();
        } finally {
          options.onEnded();
        }
        return;
      }
      if (message.kind === 'failed' || message.kind === 'underrun') {
        fail(
          new Error(
            message.kind === 'failed'
              ? `Audio processing failed: ${message.reason}.`
              : 'Audio processing underrun.'
          )
        );
        return;
      }
      if (
        message.kind !== 'source-read' ||
        reading.has(message.requestId) ||
        reading.size >= 2 ||
        message.endFrame > source.lengthFrames
      ) {
        fail(new Error('Audio processing source request failed.'));
        return;
      }
      reading.add(message.requestId);
      void source
        .read(message.startFrame, message.endFrame)
        .then((planes) => {
          if (closed) return;
          if (
            planes.length !== source.channels ||
            planes.some(
              (plane) =>
                plane.length !== message.endFrame - message.startFrame ||
                !plane.every(Number.isFinite)
            )
          )
            throw new Error('Audio processing source PCM differs.');
          // Borrowed reader buffers can alias retained pages; transfer only dedicated copies.
          const owned = planes.map((plane) => new Float32Array(plane));
          post(
            {
              kind: 'source-reply',
              generation: options.generation,
              requestId: message.requestId,
              planes: owned,
            },
            owned.map((plane) => plane.buffer)
          );
        })
        .catch(() => {
          if (!closed) {
            post({
              kind: 'source-error',
              generation: options.generation,
              requestId: message.requestId,
            });
            fail(new Error('Audio processing source is unavailable.'));
          }
        })
        .finally(() => reading.delete(message.requestId));
    };
    post(
      {
        kind: 'initialize',
        generation: options.generation,
        channels: source.channels,
        sourceLengthFrames: source.lengthFrames,
        durationFrames: options.durationFrames,
        rate: options.rate,
        processing,
        assets,
      },
      Object.values(assets).map((bytes) => bytes.buffer)
    );
    await ready;
    check();
    const output = node;
    return {
      output,
      async prime(startFrame) {
        check();
        if (
          phase !== 'ready' ||
          !Number.isSafeInteger(startFrame) ||
          startFrame < 0 ||
          startFrame > options.durationFrames
        )
          throw new Error('Audio processing prime interval is invalid.');
        phase = 'priming';
        primeStart = startFrame;
        const pending = new Promise<void>((resolve, reject) => {
          primeResolve = resolve;
          primeReject = reject;
        });
        post({ kind: 'prime', generation: options.generation, startFrame });
        await pending;
        check();
      },
      start(when, endFrame = options.durationFrames, startFrame = primeStart) {
        check();
        if (
          phase !== 'primed' ||
          !Number.isFinite(when) ||
          when < 0 ||
          !Number.isSafeInteger(Math.ceil(when * AUDIO_WORKLET_SAMPLE_RATE)) ||
          !Number.isSafeInteger(endFrame) ||
          endFrame <= startFrame ||
          endFrame > options.durationFrames ||
          !Number.isSafeInteger(startFrame) ||
          startFrame < primeStart ||
          startFrame >= bufferedEnd
        )
          throw new Error('Audio processing playback interval is invalid.');
        // The processor catches up from this clock when main-thread dispatch is delayed.
        phase = 'playing';
        post({
          kind: 'play',
          generation: options.generation,
          whenFrame: Math.ceil(when * AUDIO_WORKLET_SAMPLE_RATE),
          startFrame,
          endFrame,
        });
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
