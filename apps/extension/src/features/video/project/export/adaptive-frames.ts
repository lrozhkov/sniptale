const MAX_HOLD_US = 200_000;

type PendingFrame = { frame: VideoFrame; pixelsReady: boolean; start: number; end: number };

/** Exact VFR coalescing. The emitted native frame is borrowed until emit resolves. */
export function createAdaptiveFrameWriter(
  context: CanvasRenderingContext2D,
  emit: (frame: VideoFrame, timestampUs: number, durationUs: number) => Promise<void>,
  signal?: AbortSignal,
  budget = createAdaptiveComparisonBudget()
) {
  const { width, height } = context.canvas;
  // Reuse two buffers instead of allocating a full ImageData on every tick. Native
  // frames retain the accelerated canvas without forcing its renderer into readback mode.
  let retainedPixels = new Uint8Array(width * height * 4);
  let currentPixels = new Uint8Array(retainedPixels.length);
  const copyOptions: VideoFrameCopyToOptions = {
    format: 'RGBA',
    colorSpace: 'srgb',
    layout: [{ offset: 0, stride: width * 4 }],
  };
  let pending: PendingFrame | null = null;
  let lastEnd = -1;
  let disposed = false;
  const check = () => {
    signal?.throwIfAborted();
    if (disposed) throw new Error('Adaptive export frame writer is disposed.');
  };
  const flush = async () => {
    check();
    const held = pending;
    if (!held) return;
    pending = null;
    try {
      await emit(held.frame, held.start, held.end - held.start);
      check();
    } finally {
      held.frame.close();
    }
  };
  return {
    async add(timestampUs: number, durationUs: number) {
      check();
      if (
        !Number.isSafeInteger(timestampUs) ||
        timestampUs < 0 ||
        !Number.isSafeInteger(durationUs) ||
        durationUs <= 0 ||
        durationUs > MAX_HOLD_US ||
        timestampUs < lastEnd
      )
        throw new Error('Invalid adaptive export frame timing.');
      if (context.canvas.width !== width || context.canvas.height !== height)
        throw new Error('Adaptive export dimensions changed.');
      budget.begin();
      const frame = new VideoFrame(context.canvas, { timestamp: timestampUs });
      let retained = false;
      try {
        const end = timestampUs + durationUs;
        let pixelsReady = false;
        if (
          pending &&
          pending.end === timestampUs &&
          end - pending.start <= MAX_HOLD_US &&
          budget.available()
        ) {
          const comparisonStart = performance.now();
          let equal = false;
          try {
            if (!pending.pixelsReady) {
              await pending.frame.copyTo(retainedPixels, copyOptions);
              check();
              pending.pixelsReady = true;
            }
            await frame.copyTo(currentPixels, copyOptions);
            check();
            pixelsReady = true;
            equal = samePixels(retainedPixels, currentPixels);
          } finally {
            budget.charge(performance.now() - comparisonStart);
          }
          if (equal) {
            pending.end = end;
            lastEnd = end;
            return;
          }
        }
        await flush();
        check();
        if (pixelsReady) [retainedPixels, currentPixels] = [currentPixels, retainedPixels];
        pending = { frame, pixelsReady, start: timestampUs, end };
        retained = true;
        lastEnd = end;
      } finally {
        if (!retained) frame.close();
        budget.end();
      }
    },
    flush,
    dispose() {
      disposed = true;
      pending?.frame.close();
      pending = null;
      retainedPixels = new Uint8Array(0);
      currentPixels = new Uint8Array(0);
    },
  };
}

function samePixels(left: Uint8Array, right: Uint8Array): boolean {
  const a = new Uint32Array(left.buffer, left.byteOffset, left.byteLength / 4);
  const b = new Uint32Array(right.buffer, right.byteOffset, right.byteLength / 4);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Best-effort analysis: retain unexamined frames instead of spending unbounded time deduplicating. */
export function createAdaptiveComparisonBudget() {
  let balance = 0;
  let estimate = 0;
  let lastEnd = performance.now();
  let started = lastEnd;
  let analysis = 0;
  const credit = (work: number) => {
    // Bound credit from pauses/encoder stalls; one slow comparison may overshoot,
    // but its full cost remains debt before another attempt is admitted.
    balance = Math.min(64, balance + Math.max(0, Math.min(work, 250)) * 0.25);
  };
  return {
    begin() {
      started = performance.now();
      credit(started - lastEnd);
      analysis = 0;
    },
    available: () => balance >= Math.min(estimate, 64),
    charge(cost: number) {
      analysis += cost;
      balance -= cost;
      estimate = cost;
    },
    end() {
      lastEnd = performance.now();
      credit(lastEnd - started - analysis);
    },
  };
}
