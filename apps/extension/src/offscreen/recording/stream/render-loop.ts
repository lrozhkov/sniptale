type VideoFrameSource = Partial<
  Pick<HTMLVideoElement, 'cancelVideoFrameCallback' | 'requestVideoFrameCallback'>
>;

type VideoRenderLoopParams = {
  drawHeldFrame: () => void;
  drawSourceFrame: () => void;
  frameIntervalMs: number;
  video: VideoFrameSource;
};

export type VideoRenderLoop = {
  start(): void;
  stop(): void;
};

function requireFrameInterval(frameIntervalMs: number): number {
  if (!Number.isFinite(frameIntervalMs) || frameIntervalMs <= 0) {
    throw new Error('Video render-loop frame interval must be positive and finite');
  }
  return frameIntervalMs;
}

export function createVideoRenderLoop(params: VideoRenderLoopParams): VideoRenderLoop {
  const frameIntervalMs = requireFrameInterval(params.frameIntervalMs);
  const usesSourceFrameCallbacks =
    typeof params.video.requestVideoFrameCallback === 'function' &&
    typeof params.video.cancelVideoFrameCallback === 'function';
  let heldFrameTimer: ReturnType<typeof setInterval> | null = null;
  let sourceFrameCallbackId: number | null = null;
  let sourceFrameTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const scheduleSourceFrame = (): void => {
    if (!running || !usesSourceFrameCallbacks) return;
    sourceFrameCallbackId =
      params.video.requestVideoFrameCallback?.(() => {
        sourceFrameCallbackId = null;
        if (!running) return;
        try {
          params.drawSourceFrame();
        } finally {
          scheduleSourceFrame();
        }
      }) ?? null;
  };

  const stop = (): void => {
    if (sourceFrameCallbackId !== null) {
      params.video.cancelVideoFrameCallback?.(sourceFrameCallbackId);
      sourceFrameCallbackId = null;
    }
    if (sourceFrameTimer !== null) {
      clearInterval(sourceFrameTimer);
      sourceFrameTimer = null;
    }
    if (heldFrameTimer !== null) {
      clearInterval(heldFrameTimer);
      heldFrameTimer = null;
    }
    running = false;
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      params.drawSourceFrame();
      heldFrameTimer = setInterval(params.drawHeldFrame, frameIntervalMs);
      if (usesSourceFrameCallbacks) {
        try {
          scheduleSourceFrame();
        } catch (error) {
          stop();
          throw error;
        }
        return;
      }
      sourceFrameTimer = setInterval(params.drawSourceFrame, frameIntervalMs);
    },
    stop,
  };
}
