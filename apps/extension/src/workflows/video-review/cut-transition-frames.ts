import type {
  reviewCutTransitionAt,
  ReviewCutTransitionPlan,
} from '../../features/video/review/cuts';

/** Decoded raster with its actual presentation timestamp; a seek request is not frame authority. */
export interface ReviewTransitionSample {
  timestamp: number;
  /** Actual decoded payload accounting, available on native VideoSample instances. */
  allocationSize?(): number;
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
  close(): void;
}

type FrameSink = {
  getSample(time: number): Promise<ReviewTransitionSample | null>;
  samples(start: number, end: number): AsyncIterable<ReviewTransitionSample>;
};

export interface ReviewTransitionFrames {
  left: ReviewTransitionSample;
  right: ReviewTransitionSample;
}

/** Membership is checked after decoding, including range APIs that return a preceding frame. */
export function isReviewTransitionFrame(time: number, range: { start: number; end: number }) {
  return Number.isFinite(time) && time >= range.start && time < range.end;
}

function beforeEndpoint(value: number) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

/** Reads only actual retained timestamps. The caller owns the returned sample. */
export async function readRetainedTransitionSample<T extends ReviewTransitionSample>(
  sink: {
    getSample(time: number): Promise<T | null>;
    samples(start: number, end: number): AsyncIterable<T>;
  },
  range: { start: number; end: number },
  requestedTime: number | undefined,
  fallback: 'first' | 'last',
  check: () => void
): Promise<T | null> {
  let retained: T | null = null;
  try {
    check();
    if (requestedTime !== undefined) {
      retained = await sink.getSample(requestedTime);
      check();
      if (retained && isReviewTransitionFrame(retained.timestamp, range)) return retained;
      retained?.close();
      retained = null;
    }
    for await (const sample of sink.samples(range.start, range.end)) {
      try {
        check();
      } catch (error) {
        sample.close();
        throw error;
      }
      if (!isReviewTransitionFrame(sample.timestamp, range)) {
        sample.close();
        continue;
      }
      retained?.close();
      retained = sample;
      if (fallback === 'first') break;
    }
    check();
    return retained;
  } catch (error) {
    retained?.close();
    throw error;
  }
}

/** Owns at most one endpoint pair; the caller owns the sink's Input and cancels it on teardown. */
export function createReviewTransitionFrames(sink: FrameSink, signal: AbortSignal) {
  let generation = 0;
  let disposed = false;
  let retained: ReviewTransitionFrames | null = null;
  let request: { key: string; promise: Promise<ReviewTransitionFrames | null> } | null = null;
  const release = () => {
    retained?.left.close();
    retained?.right.close();
    retained = null;
  };
  const load = (plan: ReviewCutTransitionPlan) => {
    const key = JSON.stringify([plan.left, plan.right]);
    if (request?.key === key && !disposed) return request.promise;
    release();
    const revision = ++generation;
    const acquire = async () => {
      const owned: ReviewTransitionSample[] = [];
      const current = () => {
        signal.throwIfAborted();
        if (disposed || generation !== revision) throw new DOMException('Aborted', 'AbortError');
      };
      try {
        current();
        const left = await readRetainedTransitionSample(
          sink,
          plan.left,
          beforeEndpoint(plan.left.end),
          'last',
          current
        );
        if (!left) return null;
        owned.push(left);
        const right = await readRetainedTransitionSample(
          sink,
          plan.right,
          undefined,
          'first',
          current
        );
        if (!right) return null;
        owned.push(right);
        current();
        retained = { left, right };
        owned.length = 0;
        return retained;
      } finally {
        for (const sample of owned) sample.close();
      }
    };
    const promise = acquire();
    request = { key, promise };
    return promise;
  };
  return {
    load,
    dispose() {
      disposed = true;
      generation++;
      request = null;
      release();
    },
  };
}

/** Each side holds its own retained source frame and result-clock camera at the seam. */
export function reviewCutTransitionSides(
  blend: NonNullable<ReturnType<typeof reviewCutTransitionAt>>,
  frames: ReviewTransitionFrames,
  moving: Pick<ReviewTransitionSample, 'timestamp' | 'draw'>,
  resultTime: number,
  resultOffset = 0
) {
  const seam = blend.plan.seam + resultOffset;
  const range = blend.beforeSeam ? blend.plan.left : blend.plan.right;
  const current = isReviewTransitionFrame(moving.timestamp, range)
    ? moving
    : blend.beforeSeam
      ? frames.left
      : frames.right;
  return [
    {
      sample: blend.beforeSeam ? current : frames.left,
      resultTime: blend.beforeSeam ? resultTime : beforeEndpoint(seam),
    },
    {
      sample: blend.beforeSeam ? frames.right : current,
      resultTime: blend.beforeSeam ? seam : resultTime,
    },
  ] as const;
}

/** Dissolve decorated scenes after each side has applied its own camera and focus effects. */
export function paintReviewCutDissolve(
  target: CanvasRenderingContext2D,
  scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D },
  incoming: number,
  draw: (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    side: 0 | 1
  ) => Promise<void>,
  canvas: HTMLCanvasElement
): Promise<void>;
export function paintReviewCutDissolve(
  target: CanvasRenderingContext2D,
  scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D },
  incoming: number,
  draw: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, side: 0 | 1) => void,
  canvas: HTMLCanvasElement
): void;
export function paintReviewCutDissolve(
  target: CanvasRenderingContext2D,
  scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D },
  incoming: number,
  draw: (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    side: 0 | 1
  ) => void | Promise<void>,
  canvas: HTMLCanvasElement
) {
  const blend = () => {
    target.save();
    try {
      target.globalCompositeOperation = 'source-over';
      target.globalAlpha = incoming;
      target.drawImage(scratch.canvas, 0, 0);
    } finally {
      target.restore();
    }
  };
  const second = () => {
    const completed = draw(scratch.context, scratch.canvas, 1);
    return completed ? completed.then(blend) : blend();
  };
  const completed = draw(target, canvas, 0);
  return completed ? completed.then(second) : second();
}

/** Blends only admitted source rasters; camera, background, overlays and audio stay with callers. */
export function paintReviewCutTransition(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  blend: NonNullable<ReturnType<typeof reviewCutTransitionAt>>,
  frames: ReviewTransitionFrames,
  moving: Pick<ReviewTransitionSample, 'timestamp' | 'draw'>
) {
  const before = blend.beforeSeam;
  const range = before ? blend.plan.left : blend.plan.right;
  const current = isReviewTransitionFrame(moving.timestamp, range)
    ? moving
    : before
      ? frames.left
      : frames.right;
  const draw = (frame: Pick<ReviewTransitionSample, 'draw'>) =>
    frame.draw(context, 0, 0, size.width, size.height);
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#000000';
    context.fillRect(0, 0, size.width, size.height);
    if (blend.plan.type === 'fade-black') {
      draw(current);
    } else {
      draw(before ? current : frames.left);
      context.globalAlpha = blend.incoming;
      draw(before ? frames.right : current);
    }
  } finally {
    context.restore();
  }
}

/** Apply after all scene layers so header, background and overlays share one fade. */
export function paintReviewCutBlackout(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  blend: ReturnType<typeof reviewCutTransitionAt>
) {
  if (!blend || blend.plan.type !== 'fade-black' || blend.black <= 0) return;
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = blend.black;
    context.fillStyle = blend.plan.color ?? '#000000';
    context.fillRect(0, 0, size.width, size.height);
  } finally {
    context.restore();
  }
}
