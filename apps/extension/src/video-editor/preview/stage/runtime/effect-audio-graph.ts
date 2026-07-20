import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';
import { decodeEffectAudio } from '../../../../features/video/composition/effect-runtime/media/decode';

const EFFECT_AUDIO_SAMPLE_RATE = 48_000;

export interface PreviewEffectAudioBuffer {
  readonly kind: 'preview-effect-audio-buffer';
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
}

export interface PreviewEffectAudioNode {
  setVolume(volume: number): void;
  stop(): void;
}

export interface PreviewEffectAudioGraph {
  readonly currentTime: number;
  close(): Promise<void>;
  decode(blob: Blob, mimeType: string): Promise<PreviewEffectAudioBuffer>;
  resume(): Promise<void>;
  start(args: {
    buffer: PreviewEffectAudioBuffer;
    onEnded: () => void;
    plan: EffectRuntimeAudioPlan;
    projectTime: number;
  }): PreviewEffectAudioNode | null;
}

class BrowserEffectAudioBuffer implements PreviewEffectAudioBuffer {
  readonly kind = 'preview-effect-audio-buffer' as const;

  constructor(readonly value: AudioBuffer) {}

  get length(): number {
    return this.value.length;
  }

  get numberOfChannels(): number {
    return this.value.numberOfChannels;
  }

  get sampleRate(): number {
    return this.value.sampleRate;
  }
}

class BrowserEffectAudioNode implements PreviewEffectAudioNode {
  constructor(
    private readonly source: AudioBufferSourceNode,
    private readonly gain: GainNode
  ) {}

  setVolume(volume: number): void {
    this.gain.gain.value = volume;
  }

  stop(): void {
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // A source that has already ended is still safe to disconnect.
    }
    this.source.disconnect();
    this.gain.disconnect();
  }
}

class BrowserEffectAudioGraph implements PreviewEffectAudioGraph {
  private readonly context = new AudioContext({
    latencyHint: 'interactive',
    sampleRate: EFFECT_AUDIO_SAMPLE_RATE,
  });

  get currentTime(): number {
    return this.context.currentTime;
  }

  async close(): Promise<void> {
    if (this.context.state !== 'closed') await this.context.close();
  }

  async decode(blob: Blob, mimeType: string): Promise<PreviewEffectAudioBuffer> {
    const buffer = await decodeEffectAudio(blob, mimeType, (bytes) =>
      this.context.decodeAudioData(bytes)
    );
    return new BrowserEffectAudioBuffer(buffer);
  }

  async resume(): Promise<void> {
    await this.context.resume();
  }

  start(args: {
    buffer: PreviewEffectAudioBuffer;
    onEnded: () => void;
    plan: EffectRuntimeAudioPlan;
    projectTime: number;
  }): PreviewEffectAudioNode | null {
    if (!(args.buffer instanceof BrowserEffectAudioBuffer)) {
      throw new Error('Preview EffectV1 audio buffer does not belong to the browser graph');
    }
    const timing = resolvePlaybackTiming(args.plan, args.projectTime);
    if (!timing) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = args.buffer.value;
    source.playbackRate.value = args.plan.playbackRate;
    gain.gain.value = args.plan.volume;
    source.connect(gain);
    gain.connect(this.context.destination);
    source.onended = args.onEnded;
    source.start(0, timing.sourceOffset, timing.sourceDuration);
    source.stop(this.context.currentTime + timing.projectDuration);
    return new BrowserEffectAudioNode(source, gain);
  }
}

export function createPreviewEffectAudioGraph(): PreviewEffectAudioGraph {
  return new BrowserEffectAudioGraph();
}

function resolvePlaybackTiming(plan: EffectRuntimeAudioPlan, projectTime: number) {
  const elapsedProjectTime = Math.max(0, projectTime - plan.startTime);
  const sourceOffset = plan.sourceStart + elapsedProjectTime * plan.playbackRate;
  const sourceDuration = Math.max(0, plan.sourceDuration - elapsedProjectTime * plan.playbackRate);
  const projectDuration = Math.max(0, plan.duration - elapsedProjectTime);
  if (sourceDuration <= 0 || projectDuration <= 0) return null;
  return { projectDuration, sourceDuration, sourceOffset };
}
