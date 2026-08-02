type VideoFramePumpOptions = {
  drawHeldFrame?: () => boolean;
  drawLiveFrame: () => boolean;
  frameRate: number;
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
  return startCompensatedTimer(options.frameRate, () => {
    if (!options.drawLiveFrame()) options.drawHeldFrame?.();
  });
}
