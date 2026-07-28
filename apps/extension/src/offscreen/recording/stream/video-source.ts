import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'OffscreenVideoSource' });

export function createSourceVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  return video;
}

export async function waitForSourceMetadata(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onerror = null;
      action();
    };
    timeout = setTimeout(
      () => finish(() => reject(new Error('Timed out waiting for source metadata'))),
      10_000
    );
    const ready = () => finish(resolve);
    video.onloadedmetadata = ready;
    video.onloadeddata = ready;
    video.onerror = () => finish(() => reject(new Error('Failed to load source metadata')));
    void video
      .play()
      .catch((error: unknown) => logger.debug('Source video play deferred', { error }));
  });
  if (!Number.isFinite(video.videoWidth) || !Number.isFinite(video.videoHeight)) {
    throw new Error('Source metadata is not finite');
  }
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error(`Source has invalid dimensions: ${video.videoWidth}x${video.videoHeight}`);
  }
}

export function releaseSourceVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}
