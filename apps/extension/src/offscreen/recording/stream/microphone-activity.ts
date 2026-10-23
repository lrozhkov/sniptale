import type { VideoMicrophoneActivity } from '@sniptale/runtime-contracts/video/types/types';

type ObservationPhase = 'preparing' | 'recording' | 'paused';

interface MicrophoneActivityDependencies {
  createAudioContext: () => AudioContext;
  now: () => number;
  schedule: (sample: () => void) => ReturnType<typeof setInterval>;
  cancel: (timer: ReturnType<typeof setInterval>) => void;
}

class MicrophoneObservation {
  private phase: ObservationPhase = 'preparing';
  private enabled = true;
  private disposed = false;
  private stream: MediaStream | null = null;
  private gain = 1;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private activeSamples = 0;
  private armed = false;
  private quietSince: number | null = null;
  private activity: VideoMicrophoneActivity = { status: 'unavailable', level: 0, warning: false };
  private readonly samples = new Float32Array(1024);
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly publish: (activity: VideoMicrophoneActivity) => void,
    private readonly dependencies: MicrophoneActivityDependencies
  ) {
    this.timer = dependencies.schedule(() => this.sample());
  }

  get current(): VideoMicrophoneActivity {
    return { ...this.activity };
  }

  setSource(next: MediaStream | null, nextGain = 1): void {
    if (this.disposed) return;
    this.disconnect();
    this.resetActivity();
    this.stream = next;
    this.gain = nextGain;
    if (this.stream) {
      try {
        this.audioContext = this.dependencies.createAudioContext();
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.samples.length;
        this.source.connect(this.analyser);
      } catch {
        this.disconnect();
      }
    }
    this.sample();
  }

  setPhase(next: ObservationPhase): void {
    if (this.disposed) return;
    this.phase = next;
    this.resetActivity();
    if (this.phase === 'paused') {
      this.emit({ status: this.enabled ? 'unavailable' : 'disabled', level: 0, warning: false });
    } else {
      this.sample();
    }
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
    this.resetActivity();
    this.sample();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dependencies.cancel(this.timer);
    this.disconnect();
    this.stream = null;
    this.resetActivity();
  }

  private resetActivity(): void {
    this.activeSamples = 0;
    this.armed = false;
    this.quietSince = null;
  }

  private emit(next: VideoMicrophoneActivity): void {
    if (this.disposed) return;
    const changed = this.activity.status !== next.status || this.activity.warning !== next.warning;
    this.activity = next;
    if (this.phase === 'preparing' || changed) this.publish({ ...this.activity });
  }

  private disconnect(): void {
    try {
      this.source?.disconnect();
    } catch {
      this.source = null;
    }
    try {
      this.analyser?.disconnect();
    } catch {
      this.analyser = null;
    }
    this.source = null;
    this.analyser = null;
    const previous = this.audioContext;
    this.audioContext = null;
    if (previous) {
      try {
        void previous.close().catch(() => undefined);
      } catch {
        this.samples.fill(0);
      }
    }
    this.samples.fill(0);
  }

  private unavailable(): void {
    this.resetActivity();
    this.emit({ status: 'unavailable', level: 0, warning: false });
  }

  private sample(): void {
    if (this.disposed) return;
    const tracks = this.stream?.getAudioTracks() ?? [];
    if (!this.enabled || tracks.some((track) => !track.enabled)) {
      this.resetActivity();
      this.emit({ status: 'disabled', level: 0, warning: false });
      return;
    }
    if (this.phase === 'paused') return;
    if (!tracks.length || !this.analyser || this.audioContext?.state !== 'running') {
      this.unavailable();
      return;
    }
    let level = 0;
    try {
      if (tracks.some((track) => track.readyState !== 'ended' && !track.muted)) {
        this.analyser.getFloatTimeDomainData(this.samples);
        let sum = 0;
        for (const value of this.samples) sum += value * value;
        level = Math.min(1, Math.sqrt(sum / this.samples.length) * this.gain);
        this.samples.fill(0);
        if (!Number.isFinite(level)) throw new Error('Invalid microphone sample');
      }
    } catch {
      this.samples.fill(0);
      this.unavailable();
      return;
    }
    let warning = false;
    if (this.phase === 'recording') {
      if (level >= 0.0031622776601683794) {
        this.activeSamples += 1;
        this.armed ||= this.activeSamples >= 3;
        this.quietSince = null;
      } else {
        this.activeSamples = 0;
        if (this.armed) {
          this.quietSince ??= this.dependencies.now();
          warning = this.dependencies.now() - this.quietSince >= 20_000;
        }
      }
    }
    this.emit({ status: 'ready', level, warning });
  }
}

/** Observes a borrowed microphone input without changing its tracks. */
export function createMicrophoneActivityObserver(
  publish: (activity: VideoMicrophoneActivity) => void,
  dependencies: MicrophoneActivityDependencies = {
    createAudioContext: () => new AudioContext(),
    now: () => performance.now(),
    schedule: (sample) => setInterval(sample, 250),
    cancel: (timer) => clearInterval(timer),
  }
) {
  return new MicrophoneObservation(publish, dependencies);
}

export type MicrophoneActivityObserver = Pick<
  MicrophoneObservation,
  'current' | 'setSource' | 'setPhase' | 'setEnabled' | 'dispose'
>;
