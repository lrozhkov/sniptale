import { decodeReviewAudioClipBuffer } from './audio-clip-source';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import type {
  QuickEditAudioPlanEntry,
  QuickEditClipSchedule,
} from '../../features/video/review/advanced/audio-plan';

/** Structural surface of the preview audio graph the runtime consumes. */
export interface ReviewAudioClipBuffer {
  duration: number;
}
interface ReviewAudioHandle {
  stop(): void;
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
  scheduleClip(schedule: QuickEditClipSchedule, buffer: ReviewAudioClipBuffer): ReviewAudioHandle;
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

function connectClipSource(
  context: AudioContext,
  handles: Set<ReviewAudioHandle>,
  output: GainNode,
  schedule: QuickEditClipSchedule,
  buffer: ReviewAudioClipBuffer
): ReviewAudioHandle {
  const source = context.createBufferSource();
  source.buffer = browserBuffer(buffer);
  const gain = context.createGain();
  source.playbackRate.value = 1;
  source.connect(gain);
  gain.connect(output);
  schedule.envelope.forEach(([at, value], index) => {
    if (index === 0) gain.gain.setValueAtTime(value, Math.max(context.currentTime, at));
    else gain.gain.linearRampToValueAtTime(value, at);
  });
  source.start(schedule.when, schedule.offset, schedule.duration);
  const handle = {
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
      source.disconnect();
      gain.disconnect();
    },
  };
  source.onended = () => {
    handles.delete(handle);
    source.disconnect();
    gain.disconnect();
  };
  handles.add(handle);
  return handle;
}

/** Creates one disposable browser graph; the caller owns its session and borrowed element. */
export function createReviewAudioEngine(
  element: HTMLMediaElement | null
): ReviewAudioEngine | null {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  let originalGain: GainNode | null = null;
  let originalSource: MediaElementAudioSourceNode | null = null;
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
  const handles = new Set<ReviewAudioHandle>();
  const decoding = new AbortController();
  let disposed = false;
  const stopAll = () => {
    for (const handle of handles) handle.stop();
    handles.clear();
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
    scheduleClip: (schedule, buffer) =>
      connectClipSource(context, handles, output, schedule, buffer),
    setOriginalGain: (volume) => {
      if (originalGain) originalGain.gain.value = volume === 0 ? 0 : Math.max(1, volume);
    },
    setOutputGain: (volume) => {
      output.gain.value = Math.max(0, volume);
    },
    stopAll,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      decoding.abort();
      stopAll();
      originalSource?.disconnect();
      originalGain?.disconnect();
      output.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
