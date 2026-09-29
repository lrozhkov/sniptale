const MAX_FRAMES = 48;
const MAX_BYTES = 6 * 1024 * 1024;

/** Quantize hover intent to the frame position shown beside the resulting image. */
export function sampleVideoTime(time: number, duration: number): number {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const end = Number.isFinite(duration) && duration > 0 ? Math.ceil(duration) : Infinity;
  return Math.min(Math.round(safeTime), end);
}

type Frame = { dataUrl: string; bytes: number };

/** Owns decoded frame surfaces and their in-memory LRU budget for one source. */
export function createVideoFrameStore() {
  const canvas = document.createElement('canvas');
  const frames = new Map<number, Frame>();
  let bytes = 0;

  return {
    has(sampleTime: number) {
      return frames.has(sampleTime);
    },
    get(sampleTime: number) {
      const frame = frames.get(sampleTime);
      if (!frame) return undefined;
      frames.delete(sampleTime);
      frames.set(sampleTime, frame);
      return frame.dataUrl;
    },
    remember(sampleTime: number, video: HTMLVideoElement) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error('Video dimensions unavailable');
      const scale = Math.min(192 / width, 144 / height);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame: Frame = {
        dataUrl: canvas.toDataURL('image/jpeg', 0.75),
        bytes: canvas.width * canvas.height * 4,
      };
      const old = frames.get(sampleTime);
      if (old) bytes -= old.bytes;
      frames.delete(sampleTime);
      frames.set(sampleTime, frame);
      bytes += frame.bytes;
      while (frames.size > MAX_FRAMES || bytes > MAX_BYTES) {
        const oldest = frames.keys().next().value;
        if (oldest === undefined) break;
        bytes -= frames.get(oldest)!.bytes;
        frames.delete(oldest);
      }
    },
    clear() {
      frames.clear();
      bytes = 0;
    },
  };
}
