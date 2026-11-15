import { createLogger } from '@sniptale/platform/observability/logger';
import { createAudioProcessingWorklet } from '../../features/video/audio/effects/worklet-node';
import {
  createReviewAudioClipCanonicalSource,
  hasReviewAudioProcessing,
} from './audio-clip-processing';
import { openReviewAudioClipSource } from './audio-clip-source';
import { decodeReviewAudioClipBuffer } from './audio-clip-source';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import type {
  QuickEditAudioPlanEntry,
  QuickEditClipSchedule,
} from '../../features/video/review/advanced/audio-plan';

const audioLogger = createLogger({ namespace: 'video-review.audio-processing' });
function reportAudioProcessingFailure(
  stage: 'resume' | 'decode' | 'source' | 'worklet' | 'prime' | 'start' | 'stream',
  error: unknown
) {
  let reason = 'unknown';
  if (error instanceof Error) {
    switch (error.message) {
      case 'External audio cannot be decoded':
        reason = 'decode-unavailable';
        break;
      case 'Invalid external audio parameters':
        reason = 'invalid-source-format';
        break;
      case 'Audio processor implementation is unavailable.':
        reason = 'implementation-unavailable';
        break;
      case 'Fixed audio asset digest differs.':
        reason = 'asset-integrity';
        break;
      case 'Audio processing playback interval is invalid.':
        reason = 'invalid-playback-window';
        break;
      case 'Audio processing underrun.':
        reason = 'underrun';
        break;
      case 'Audio processing context stopped.':
        reason = 'context-stopped';
        break;
      case 'Audio processing source is unavailable.':
        reason = 'source-unavailable';
        break;
      case 'Audio processing failed: protocol.':
        reason = 'processor-protocol';
        break;
      case 'Audio processing failed: prepare.':
        reason = 'processor-prepare';
        break;
      case 'Audio processing failed: source.':
        reason = 'processor-source';
        break;
      case 'Audio processing failed: render.':
        reason = 'processor-render';
        break;
    }
    if (reason === 'unknown' && error.name === 'NotSupportedError') reason = 'browser-unsupported';
  }
  audioLogger.warn('Processed audio preview failed.', { stage, reason });
}

/** Structural surface of the preview audio graph the runtime consumes. */
export interface ReviewAudioClipBuffer {
  duration: number;
}
export interface ReviewAudioPreparedClip {
  schedule(schedule: QuickEditClipSchedule): ReviewAudioHandle;
  dispose(): void;
}
interface ReviewAudioHandle {
  stop(): void;
}
interface OwnedAudioHandle extends ReviewAudioHandle {
  release(): void;
}
export interface ReviewAudioEngine {
  now(): number;
  resume(): Promise<void>;
  decode(data: ArrayBuffer): Promise<ReviewAudioClipBuffer>;
  /** Prepares the selected clip span at its applied tempo, preserving native pitch. */
  prepareClip(
    buffer: ReviewAudioClipBuffer,
    entry: QuickEditAudioPlanEntry,
    signal: AbortSignal
  ): Promise<ReviewAudioClipBuffer>;
  /** Primes bounded processed PCM before transport start; the graph owns the decoder and node. */
  prepareProcessedClip?(
    source: Blob,
    entry: QuickEditAudioPlanEntry,
    elapsed: number,
    signal: AbortSignal,
    onError: (error: Error) => void
  ): Promise<ReviewAudioPreparedClip>;
  scheduleClip(schedule: QuickEditClipSchedule, buffer: ReviewAudioClipBuffer): ReviewAudioHandle;
  /** Silences the connected dry media route during processing, preserving the browser media clock. */
  setOriginalProcessing?(active: boolean): void;
  /** Graph-side amplification for original-audio volume beyond the element range. */
  setOriginalGain(volume: number): void;
  /** Sets the external-audio output bus independently of clip and original gains. */
  setOutputGain(volume: number): void;
  stopAll(): void;
  /** Permanently releases this element's graph and its AudioContext. */
  dispose(): void;
}

/** Carries already decoded browser samples without changing their decoder or ownership. */
export class BrowserReviewAudioBuffer implements ReviewAudioClipBuffer {
  constructor(readonly value: AudioBuffer) {}
  get duration() {
    return this.value.duration;
  }
}

function browserBuffer(buffer: ReviewAudioClipBuffer): AudioBuffer {
  if (!(buffer instanceof BrowserReviewAudioBuffer))
    throw new Error('Review audio buffer does not belong to this browser graph');
  return buffer.value;
}

const PREVIEW_EDGE_SECONDS = 0.005;

/** Smooths only disposable preview graph edges. Source clocks and authored envelopes stay unchanged. */
function createPreviewAudioEdge(
  context: AudioContext,
  input: AudioNode,
  output: AudioNode,
  when: number,
  end: number
) {
  const gain = context.createGain();
  const attackEnd = Math.min(when + PREVIEW_EDGE_SECONDS, (when + end) / 2);
  gain.gain.value = 0;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(1, attackEnd);
  const releaseStart = Math.max(attackEnd, end - PREVIEW_EDGE_SECONDS);
  gain.gain.setValueAtTime(1, releaseStart);
  gain.gain.linearRampToValueAtTime(0, end);
  input.connect(gain);
  gain.connect(output);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  return {
    stop(release: () => void) {
      const now = context.currentTime;
      if (context.state !== 'running' || now < when || now >= end) {
        release();
        return;
      }
      const until = Math.min(end, now + PREVIEW_EDGE_SECONDS);
      const held = Math.max(
        0,
        Math.min(1, (now - when) / (attackEnd - when), (end - now) / (end - releaseStart))
      );
      // This private gain has only these known edges, so preserve its exact current level.
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(held, now);
      gain.gain.linearRampToValueAtTime(0, until);
      // Release follows the audio clock, including a temporarily stalled renderer.
      const finish = () => {
        if (disposed) return;
        const remaining = until - context.currentTime;
        if (context.state === 'running' && remaining > 0) {
          timer = setTimeout(finish, Math.ceil((remaining + 256 / context.sampleRate) * 1000));
          return;
        }
        release();
      };
      timer = setTimeout(finish, Math.ceil((until - now + 256 / context.sampleRate) * 1000));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      gain.disconnect();
    },
  };
}

function connectClipSource(
  context: AudioContext,
  handles: Set<OwnedAudioHandle>,
  output: GainNode,
  schedule: QuickEditClipSchedule,
  buffer: ReviewAudioClipBuffer
): ReviewAudioHandle {
  const source = context.createBufferSource();
  source.buffer = browserBuffer(buffer);
  const gain = context.createGain();
  source.playbackRate.value = 1;
  source.connect(gain);
  const edge = createPreviewAudioEdge(
    context,
    gain,
    output,
    schedule.when,
    schedule.when + schedule.duration
  );
  schedule.envelope.forEach(([at, value], index) => {
    if (index === 0 || schedule.envelopeMode === 'step')
      gain.gain.setValueAtTime(value, Math.max(context.currentTime, at));
    else gain.gain.linearRampToValueAtTime(value, at);
  });
  let closed = false,
    released = false;
  const handle: OwnedAudioHandle = {
    stop() {
      if (closed) return;
      closed = true;
      edge.stop(handle.release);
    },
    release() {
      if (released) return;
      closed = released = true;
      handles.delete(handle);
      edge.dispose();
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already finished. */
      }
      source.disconnect();
      gain.disconnect();
    },
  };
  source.onended = handle.release;
  handles.add(handle);
  try {
    source.start(schedule.when, schedule.offset, schedule.duration);
  } catch (error) {
    handle.release();
    throw error;
  }
  return handle;
}

/** Creates one disposable browser graph; the caller owns its session and borrowed element. */
export function createReviewAudioEngine(
  element: HTMLMediaElement | null,
  dependencies: {
    openSource?: typeof openReviewAudioClipSource;
    createWorklet?: typeof createAudioProcessingWorklet;
  } = {}
): ReviewAudioEngine | null {
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 48000 });
  } catch {
    return null;
  }
  let originalGain: GainNode | null = null;
  let originalSource: MediaElementAudioSourceNode | null = null;
  let originalDryGate: GainNode | null = null;
  if (element) {
    const source = context.createMediaElementSource(element);
    originalSource = source;
    originalGain = context.createGain();
    source.connect(originalGain);
    originalGain.connect(context.destination);
  }
  const output = context.createGain();
  output.gain.value = 1;
  output.connect(context.destination);
  const handles = new Set<OwnedAudioHandle>();
  const decoding = new AbortController();
  let disposed = false;
  let originalProcessing = false;
  const stopAll = () => {
    for (const handle of handles) handle.stop();
  };
  return {
    now: () => context.currentTime,
    resume: () => context.resume(),
    decode: async (data) =>
      new BrowserReviewAudioBuffer(await decodeReviewAudioClipBuffer(data, decoding.signal)),
    prepareClip: async (buffer, entry, signal) => {
      const rate = entry.playbackRate ?? 1;
      if (rate === 1) return buffer;
      const prepared = await renderTempoBuffer(
        browserBuffer(buffer),
        { start: entry.sourceOffset, duration: entry.duration * rate, rate },
        signal
      );
      signal.throwIfAborted();
      return new BrowserReviewAudioBuffer(prepared);
    },
    prepareProcessedClip: async (blob, entry, elapsed, requestSignal, onError) => {
      requestSignal.throwIfAborted();
      if (entry.lane === 'original' && (!originalProcessing || !originalGain))
        throw new Error('Processed original audio route is unavailable.');
      if (!hasReviewAudioProcessing(entry.audioProcessing))
        throw new Error('Processed audio settings are inactive.');
      const controller = new AbortController();
      const signal = controller.signal;
      let decoder: Awaited<ReturnType<typeof openReviewAudioClipSource>> | undefined;
      let reader: ReturnType<typeof createReviewAudioClipCanonicalSource> | undefined;
      let worklet: Awaited<ReturnType<typeof createAudioProcessingWorklet>> | undefined;
      let gain: GainNode | undefined;
      let edge: ReturnType<typeof createPreviewAudioEdge> | undefined;
      let graphReleased = false;
      let closed = false,
        released = false,
        scheduled = false;
      const releaseSource = () => {
        if (released) return;
        released = true;
        try {
          reader?.dispose();
        } finally {
          decoder?.dispose();
        }
      };
      const handle: OwnedAudioHandle = {
        stop() {
          if (closed) return;
          closed = true;
          requestSignal.removeEventListener('abort', handle.stop);
          if (scheduled && edge && !disposed) edge.stop(handle.release);
          else handle.release();
        },
        release() {
          if (graphReleased) return;
          graphReleased = closed = true;
          handles.delete(handle);
          requestSignal.removeEventListener('abort', handle.stop);
          signal.removeEventListener('abort', handle.stop);
          edge?.dispose();
          controller.abort();
          try {
            worklet?.dispose();
          } finally {
            releaseSource();
            gain?.disconnect();
          }
        },
      };
      handles.add(handle);
      requestSignal.addEventListener('abort', handle.stop, { once: true });
      signal.addEventListener('abort', handle.stop, { once: true });
      if (requestSignal.aborted) handle.stop();
      let stage: 'resume' | 'decode' | 'source' | 'worklet' | 'prime' = 'resume';
      try {
        signal.throwIfAborted();
        await context.resume();
        signal.throwIfAborted();
        stage = 'decode';
        decoder = await (dependencies.openSource ?? openReviewAudioClipSource)(blob, signal);
        // A decoder can settle after cancellation. Its ownership starts on resolution.
        if (closed) {
          decoder.dispose();
          signal.throwIfAborted();
          throw new Error('Processed audio preparation is closed.');
        }
        signal.throwIfAborted();
        stage = 'source';
        reader = createReviewAudioClipCanonicalSource(entry, decoder, signal);
        const rate = entry.playbackRate ?? 1;
        const durationFrames = Math.round(entry.duration * 48000);
        const startFrame = Math.max(0, Math.min(durationFrames - 1, Math.round(elapsed * 48000)));
        stage = 'worklet';
        worklet = await (dependencies.createWorklet ?? createAudioProcessingWorklet)({
          context,
          source: {
            channels: reader.channels,
            lengthFrames: reader.lengthFrames,
            read: reader.read,
            dispose: releaseSource,
          },
          processing: entry.audioProcessing!,
          rate,
          durationFrames,
          generation: 1,
          signal,
          onEnded: () => handle.release(),
          onError(error) {
            if (closed) return;
            if (!signal.aborted) reportAudioProcessingFailure('stream', error);
            handle.release();
            onError(error);
          },
        });
        if (closed) {
          worklet.dispose();
          signal.throwIfAborted();
          throw new Error('Processed audio preparation is closed.');
        }
        signal.throwIfAborted();
        stage = 'prime';
        await worklet.prime(startFrame);
        signal.throwIfAborted();
        return {
          dispose: () => handle.stop(),
          schedule(schedule) {
            if (closed || scheduled || !worklet)
              throw new Error('Processed audio placement is unavailable.');
            const when = Math.max(schedule.when, context.currentTime + 256 / 48000);
            const skipped = when - schedule.when;
            const from = Math.round(
              ((schedule.offset - entry.sourceOffset) / rate + skipped) * 48000
            );
            const end = Math.min(
              durationFrames,
              Math.round(
                ((schedule.offset - entry.sourceOffset + schedule.duration) / rate) * 48000
              )
            );
            if (end <= from) {
              handle.stop();
              return handle;
            }
            gain = context.createGain();
            worklet.output.connect(gain);
            edge = createPreviewAudioEdge(
              context,
              gain,
              entry.lane === 'original' ? originalGain! : output,
              when,
              when + (end - from) / 48000
            );
            schedule.envelope.forEach(([at, value], index) => {
              if (index === 0 || schedule.envelopeMode === 'step')
                gain!.gain.setValueAtTime(value, Math.max(context.currentTime, at));
              else gain!.gain.linearRampToValueAtTime(value, at);
            });
            try {
              worklet.start(when, end, from);
              scheduled = true;
            } catch (error) {
              if (!signal.aborted) reportAudioProcessingFailure('start', error);
              handle.release();
              throw error;
            }
            return handle;
          },
        };
      } catch (error) {
        if (!signal.aborted) reportAudioProcessingFailure(stage, error);
        handle.release();
        throw error;
      }
    },
    scheduleClip: (schedule, buffer) =>
      connectClipSource(context, handles, output, schedule, buffer),
    setOriginalProcessing: (active) => {
      if (active === originalProcessing) return;
      if (active && (!originalSource || !originalGain))
        throw new Error('Original audio graph is unavailable.');
      if (active && !originalDryGate && originalSource && originalGain) {
        // Disconnecting a MediaElementAudioSource stalls Chromium's media clock.
        // A connected silent gate suppresses dry sound while the processed bus stays separate.
        originalDryGate = context.createGain();
        originalDryGate.gain.value = 0;
        originalDryGate.connect(originalGain);
        originalSource.disconnect();
        originalSource.connect(originalDryGate);
      }
      originalProcessing = active;
      if (originalDryGate) originalDryGate.gain.value = active ? 0 : 1;
      if (originalGain) originalGain.gain.value = 1;
    },
    setOriginalGain: (volume) => {
      if (originalGain)
        originalGain.gain.value = originalProcessing ? 1 : volume === 0 ? 0 : Math.max(1, volume);
    },
    setOutputGain: (volume) => {
      output.gain.value = Math.max(0, volume);
    },
    stopAll,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      decoding.abort();
      for (const handle of handles) handle.release();
      handles.clear();
      originalSource?.disconnect();
      originalDryGate?.disconnect();
      originalGain?.disconnect();
      output.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
