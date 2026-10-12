import { vi } from 'vitest';
import {
  useReviewAudioRuntime,
  type ReviewAudioClipBuffer,
  type ReviewAudioEngine,
} from './use-review-audio-runtime';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';
type RuntimeArgs = Parameters<typeof useReviewAudioRuntime>[0];

export class FakeEngine implements ReviewAudioEngine {
  scheduled: Array<{ schedule: unknown; buffer: unknown }> = [];
  stops = 0;
  gains: number[] = [];
  currentTime = 100;
  failResume = false;
  dispose = vi.fn(() => this.stopAll());
  readonly decoded = { duration: 10 } satisfies ReviewAudioClipBuffer;
  async resume() {
    if (this.failResume) throw new Error('autoplay failed');
  }
  now() {
    return this.currentTime;
  }
  async decode() {
    return this.decoded;
  }
  async prepareClip(
    _buffer: ReviewAudioClipBuffer,
    _entry: QuickEditAudioPlanEntry,
    _signal: AbortSignal
  ) {
    return this.decoded;
  }
  scheduleClip(schedule: unknown, buffer: unknown) {
    this.scheduled.push({ schedule, buffer });
    return { stop: () => undefined };
  }
  setOriginalGain(volume: number) {
    this.gains.push(volume);
  }
  stopAll() {
    this.stops += 1;
  }
}

export function renderRuntime(args: Partial<RuntimeArgs>) {
  const base: RuntimeArgs = {
    video: { current: document.createElement('video') },
    playing: false,
    outputTime: 0,
    original: { muted: false, volume: 1 },
    voiceover: [],
    music: [],
    resolveAsset: async () => null,
    sessionKey: 'session-1',
    onFailure: () => undefined,
    createEngine: () => null,
    ...args,
  };
  const Harness = (patch: Partial<RuntimeArgs>) => {
    controls = useReviewAudioRuntime({ ...base, ...patch });
    return null;
  };
  let controls!: ReturnType<typeof useReviewAudioRuntime>;
  return {
    Harness,
    get controls() {
      return controls;
    },
  };
}
