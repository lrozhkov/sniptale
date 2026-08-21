import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'OffscreenVideoFramePump' });

function describeVideoFrame(frame: VideoFrame) {
  return {
    codedHeight: frame.codedHeight,
    codedWidth: frame.codedWidth,
    displayHeight: frame.displayHeight,
    displayWidth: frame.displayWidth,
    format: frame.format,
    visibleRect: frame.visibleRect
      ? {
          height: frame.visibleRect.height,
          width: frame.visibleRect.width,
          x: frame.visibleRect.x,
          y: frame.visibleRect.y,
        }
      : null,
  };
}

type VideoFramePumpOptions = {
  drawHeldFrame?: () => boolean;
  drawLiveFrame: (frame?: VideoFrame) => boolean;
  frameRate: number;
  onFrameDrawn?: () => void;
  onSourceFailure?: (error: Error) => void;
  sourceTrack?: MediaStreamVideoTrack;
  sourceVideo?: HTMLVideoElement;
};

export function resolveFixedVideoFrameRate(
  requestedFrameRate: number,
  sourceFrameRate: number | undefined
): number {
  if (!Number.isFinite(requestedFrameRate) || requestedFrameRate <= 0) {
    throw new Error('Requested video frame rate must be positive and finite');
  }
  if (
    typeof sourceFrameRate === 'number' &&
    Number.isFinite(sourceFrameRate) &&
    sourceFrameRate > 0 &&
    sourceFrameRate < requestedFrameRate
  ) {
    throw new Error(
      `Recording requested ${requestedFrameRate} FPS, source provides ${sourceFrameRate} FPS`
    );
  }
  return requestedFrameRate;
}

function startCompensatedTimer(frameRate: number, callback: () => void): () => void {
  const periodMs = 1000 / frameRate;
  let nextDeadline = performance.now() + periodMs;
  let timer: ReturnType<typeof setTimeout>;

  const schedule = () => {
    timer = setTimeout(tick, Math.max(0, nextDeadline - performance.now()));
  };
  const tick = () => {
    callback();
    const now = performance.now();
    do {
      nextDeadline += periodMs;
    } while (nextDeadline <= now);
    schedule();
  };

  schedule();
  return () => clearTimeout(timer);
}

export function startVideoFramePump(options: VideoFramePumpOptions): () => void {
  if (options.sourceTrack) return startSourceDrivenFramePump(options, options.sourceTrack);
  if (options.sourceVideo) return startVideoElementFramePump(options, options.sourceVideo);
  return startCompensatedTimer(options.frameRate, () => {
    const drawn = options.drawLiveFrame() || options.drawHeldFrame?.() === true;
    if (drawn) options.onFrameDrawn?.();
  });
}

function startVideoElementFramePump(
  options: VideoFramePumpOptions,
  sourceVideo: HTMLVideoElement
): () => void {
  if (typeof sourceVideo.requestVideoFrameCallback !== 'function') {
    throw new Error('Source-driven camera output requires requestVideoFrameCallback');
  }
  const periodMs = 1000 / options.frameRate;
  const timingToleranceMs = periodMs * 0.1;
  let callbackId: number | null = null;
  let nextEmissionTimestamp = Number.NEGATIVE_INFINITY;
  let stopped = false;
  const schedule = () => {
    callbackId = sourceVideo.requestVideoFrameCallback((now) => {
      if (stopped) return;
      if (now + timingToleranceMs >= nextEmissionTimestamp && options.drawLiveFrame()) {
        if (nextEmissionTimestamp === Number.NEGATIVE_INFINITY) {
          nextEmissionTimestamp = now;
        }
        do {
          nextEmissionTimestamp += periodMs;
        } while (nextEmissionTimestamp <= now);
        options.onFrameDrawn?.();
      }
      schedule();
    });
  };
  schedule();
  return () => {
    stopped = true;
    if (callbackId !== null && typeof sourceVideo.cancelVideoFrameCallback === 'function') {
      sourceVideo.cancelVideoFrameCallback(callbackId);
    }
  };
}

function startSourceDrivenFramePump(
  options: VideoFramePumpOptions,
  sourceTrack: MediaStreamVideoTrack
): () => void {
  if (typeof MediaStreamTrackProcessor === 'undefined') {
    throw new Error('Source-driven video transforms require MediaStreamTrackProcessor');
  }
  const abortController = new AbortController();
  const processor = new MediaStreamTrackProcessor({ track: sourceTrack });
  const minimumFrameIntervalUs = 1_000_000 / options.frameRate;
  let nextEmissionTimestamp = Number.NEGATIVE_INFINITY;
  let loggedFirstSourceFrame = false;
  const sink = new WritableStream<VideoFrame>({
    write: (frame) => {
      try {
        if (!loggedFirstSourceFrame) {
          loggedFirstSourceFrame = true;
          logger.info('Observed first pre-transform source frame', describeVideoFrame(frame));
        }
        if (frame.timestamp + 1 >= nextEmissionTimestamp) {
          if (options.drawLiveFrame(frame)) {
            if (nextEmissionTimestamp === Number.NEGATIVE_INFINITY) {
              nextEmissionTimestamp = frame.timestamp;
            }
            do {
              nextEmissionTimestamp += minimumFrameIntervalUs;
            } while (nextEmissionTimestamp <= frame.timestamp);
            options.onFrameDrawn?.();
          }
        }
      } finally {
        frame.close();
      }
    },
  });
  void processor.readable
    .pipeTo(sink, { signal: abortController.signal })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      options.onSourceFailure?.(error instanceof Error ? error : new Error(String(error)));
    });
  return () => abortController.abort();
}
