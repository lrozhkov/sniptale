const TIMELINE_PREVIEW_FRAME_WIDTH = 320;
const TIMELINE_PREVIEW_FRAME_HEIGHT = 180;
const TIMELINE_PREVIEW_FRAME_QUALITY = 0.72;

export interface TimelineVideoFrameLoadPlan {
  projectId?: string;
  sourceKey?: string;
  assetUrl: string;
  samples: readonly TimelineVideoFrameSample[];
  signal?: AbortSignal;
}

export interface TimelineVideoFrameSample {
  cacheKey: string;
  sourceTime: number;
}

export interface TimelineVideoFrameLoadResult {
  blob?: Blob;
  cacheKey: string;
  sourceTime: number;
  url: string;
}

export async function loadTimelineVideoPreviewFrames(
  plan: TimelineVideoFrameLoadPlan
): Promise<readonly TimelineVideoFrameLoadResult[]> {
  const video = createTimelinePreviewVideoElement(plan.assetUrl);
  const createdResults: TimelineVideoFrameLoadResult[] = [];

  try {
    assertTimelinePreviewNotAborted(plan.signal);
    await waitForVideoEvent(video, 'loadeddata', plan.signal);
    for (const sample of plan.samples) {
      assertTimelinePreviewNotAborted(plan.signal);
      await seekTimelinePreviewVideo(video, sample.sourceTime, plan.signal);
      const blob = await canvasToTimelinePreviewBlob(drawTimelinePreviewFrame(video));
      const url = URL.createObjectURL(blob);
      createdResults.push({ cacheKey: sample.cacheKey, sourceTime: sample.sourceTime, url, blob });
      await yieldTimelinePreviewFrame();
    }
  } catch (error) {
    revokePreviewUrls(createdResults.map((result) => result.url));
    throw error;
  } finally {
    video.src = '';
  }

  return createdResults;
}

function createTimelinePreviewVideoElement(assetUrl: string) {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = assetUrl;
  return video;
}

async function seekTimelinePreviewVideo(
  video: HTMLVideoElement,
  sampleTime: number,
  signal: AbortSignal | undefined
) {
  const safeTime = Number.isFinite(sampleTime) ? Math.max(0, sampleTime) : 0;
  // Metadata readiness can precede usable pixels at time zero in Chromium.
  const seeked = waitForVideoEvent(video, 'seeked', signal);
  video.currentTime = safeTime;
  await seeked;
}

function drawTimelinePreviewFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TIMELINE_PREVIEW_FRAME_WIDTH;
  canvas.height = TIMELINE_PREVIEW_FRAME_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Timeline preview canvas context unavailable');
  }

  const sourceWidth = video.videoWidth || TIMELINE_PREVIEW_FRAME_WIDTH;
  const sourceHeight = video.videoHeight || TIMELINE_PREVIEW_FRAME_HEIGHT;
  const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas;
}

async function canvasToTimelinePreviewBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Timeline preview failed'))),
      'image/webp',
      TIMELINE_PREVIEW_FRAME_QUALITY
    );
  });
}

function revokePreviewUrls(urls: readonly string[]): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

async function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadeddata' | 'seeked',
  signal: AbortSignal | undefined
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Timeline preview video failed'));
    };
    const handleAbort = () => {
      cleanup();
      reject(createTimelinePreviewAbortError());
    };
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function assertTimelinePreviewNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createTimelinePreviewAbortError();
  }
}

function createTimelinePreviewAbortError(): DOMException {
  return new DOMException('Timeline preview loading aborted', 'AbortError');
}

async function yieldTimelinePreviewFrame(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
