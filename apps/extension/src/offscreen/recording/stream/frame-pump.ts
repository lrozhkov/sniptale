type VideoFramePumpOptions = {
  drawHeldFrame?: () => boolean;
  drawLiveFrame: () => boolean;
  frameRate: number;
  onFrameDrawn?: () => void;
  sourceVideo?: HTMLVideoElement;
};

export function resolveFixedVideoFrameRate(
  requestedFrameRate: number,
  sourceFrameRate: number | undefined
): number {
  if (!Number.isFinite(requestedFrameRate) || requestedFrameRate <= 0) {
    throw new Error('Requested video frame rate must be positive and finite');
  }
  return typeof sourceFrameRate === 'number' &&
    Number.isFinite(sourceFrameRate) &&
    sourceFrameRate > 0
    ? Math.min(requestedFrameRate, sourceFrameRate)
    : requestedFrameRate;
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
  const source = options.sourceVideo;
  if (source && typeof source.requestVideoFrameCallback === 'function') {
    const periodMs = 1000 / options.frameRate;
    const timingToleranceMs = periodMs * 0.1;
    let callbackId: number | null = null;
    let nextDrawTime = Number.NEGATIVE_INFINITY;
    let stopped = false;
    const schedule = () => {
      callbackId = source.requestVideoFrameCallback((now) => {
        if (stopped) return;
        if (now + timingToleranceMs >= nextDrawTime) {
          if (options.drawLiveFrame()) {
            options.onFrameDrawn?.();
            if (!Number.isFinite(nextDrawTime)) nextDrawTime = now;
            do {
              nextDrawTime += periodMs;
            } while (nextDrawTime <= now);
          }
        }
        schedule();
      });
    };
    schedule();
    return () => {
      stopped = true;
      if (callbackId !== null && typeof source.cancelVideoFrameCallback === 'function') {
        source.cancelVideoFrameCallback(callbackId);
      }
    };
  }

  return startCompensatedTimer(options.frameRate, () => {
    const drawn = options.drawLiveFrame() || options.drawHeldFrame?.() === true;
    if (drawn) options.onFrameDrawn?.();
  });
}
