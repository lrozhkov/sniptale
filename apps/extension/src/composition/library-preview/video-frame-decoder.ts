const SEEK_TIMEOUT_MS = 8000;

type DecoderEvents = {
  onReady(): void;
  onSeekComplete(success: boolean, video: HTMLVideoElement): void;
  onError(): void;
};

/** Owns one borrowed-source media element and one seek at a time. */
export function createVideoFrameDecoder(src: string, events: DecoderEvents) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  let ready = false;
  let failed = false;
  let disposed = false;
  let target: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const finish = (success: boolean) => {
    if (disposed || target === null) return;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    target = null;
    events.onSeekComplete(success, video);
  };
  const onLoaded = () => {
    if (failed) return;
    ready = true;
    events.onReady();
  };
  const onSeeked = () => {
    if (target === null || video.seeking || video.readyState < 2) return;
    if (Math.abs(video.currentTime - target) < 0.05) finish(true);
  };
  const onError = () => {
    failed = true;
    events.onError();
    finish(false);
  };
  video.addEventListener('loadeddata', onLoaded);
  video.addEventListener('seeked', onSeeked);
  video.addEventListener('error', onError);
  video.src = src;

  return {
    isReady() {
      return ready && !failed && !disposed;
    },
    seek(time: number) {
      if (disposed || failed || !ready || target !== null) return false;
      target = time;
      timeout = setTimeout(() => finish(false), SEEK_TIMEOUT_MS);
      try {
        video.currentTime = time;
        if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.001) {
          finish(true);
        }
      } catch {
        finish(false);
      }
      return true;
    },
    cancel() {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      target = null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timeout !== null) clearTimeout(timeout);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
      target = null;
    },
  };
}
