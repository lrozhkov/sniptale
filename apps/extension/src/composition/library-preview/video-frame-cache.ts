import { createVideoFrameDecoder } from './video-frame-decoder';
import { createVideoFrameRequests } from './video-frame-requests';
import { createVideoFrameStore, sampleVideoTime } from './video-frame-store';

export { sampleVideoTime } from './video-frame-store';

export type VideoFrameSnapshot = {
  sampleTime: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  dataUrl?: string;
};

/** A source-owned, disposable decoder. The source URL remains owned by its caller. */
export type VideoFrameCache = {
  request(time: number, duration: number): VideoFrameSnapshot;
  get(time: number, duration: number): VideoFrameSnapshot;
  setDuration(duration: number): void;
  dispose(): void;
};

export function createVideoFrameCache(src: string, onChange: () => void): VideoFrameCache {
  const frames = createVideoFrameStore();
  const requests = createVideoFrameRequests();
  let disposed = false;
  let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

  const get = (time: number, duration: number): VideoFrameSnapshot => {
    const sampleTime = sampleVideoTime(time, duration);
    const dataUrl = frames.get(sampleTime);
    if (dataUrl) return { sampleTime, status: 'ready', dataUrl };
    return { sampleTime, status: requests.status(sampleTime) };
  };
  const schedule = () => {
    if (disposed || !decoder.isReady()) return;
    if (backgroundTimer !== null) clearTimeout(backgroundTimer);
    backgroundTimer = null;
    const next = requests.next((sample) => frames.has(sample));
    if (!next) return;
    if (!decoder.seek(next.seekTime)) {
      requests.complete(false, () => {});
      onChange();
    }
  };
  const decoder = createVideoFrameDecoder(src, {
    onReady: schedule,
    onSeekComplete(success, video) {
      if (disposed) return;
      const urgent = requests.complete(success, (sample) => frames.remember(sample, video));
      onChange();
      // Yield between background seeks so a newly arriving pointer request wins.
      if (urgent) schedule();
      else backgroundTimer = setTimeout(schedule, 0);
    },
    onError() {
      if (disposed) return;
      requests.failMedia();
      onChange();
    },
  });

  return {
    get,
    request(time, duration) {
      if (disposed) return { sampleTime: sampleVideoTime(time, duration), status: 'idle' };
      const intent = requests.request(time, duration, (candidate) => frames.has(candidate));
      if (intent.supersede) decoder.cancel();
      if (intent.schedule) schedule();
      return get(intent.sample, duration);
    },
    setDuration(duration) {
      if (disposed) return;
      requests.setDuration(duration);
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (backgroundTimer !== null) clearTimeout(backgroundTimer);
      decoder.dispose();
      requests.dispose();
      frames.clear();
    },
  };
}
