type VideoFramePumpOptions = {
  drawHeldFrame?: () => void;
  drawLiveFrame: () => void;
  frameRate: number;
};

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
    options.drawLiveFrame();
    options.drawHeldFrame?.();
  });
}
