import type {
  reviewCutTransitionAt,
  ReviewCutTransitionPlan,
} from '../../features/video/review/cuts';

/** Decoded raster with its actual presentation timestamp; a seek request is not frame authority. */
export interface ReviewTransitionSample {
  timestamp: number;
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
        let left = await sink.getSample(beforeEndpoint(plan.left.end));
        if (left) owned.push(left);
        current();
        if (!left || !isReviewTransitionFrame(left.timestamp, plan.left)) {
          left?.close();
          owned.length = 0;
          left = null;
          // Packet lookup may round an almost-endpoint request onto the excluded boundary.
          // Range iteration and actual timestamps remain authoritative, including VFR sources.
          for await (const sample of sink.samples(plan.left.start, plan.left.end)) {
            owned.push(sample);
            current();
            if (!isReviewTransitionFrame(sample.timestamp, plan.left)) {
              sample.close();
              owned.pop();
              continue;
            }
            left?.close();
            left = sample;
            owned.splice(0, owned.length - 1);
          }
          if (!left) return null;
        }
        let right: ReviewTransitionSample | null = null;
        for await (const sample of sink.samples(plan.right.start, plan.right.end)) {
          owned.push(sample);
          current();
          if (isReviewTransitionFrame(sample.timestamp, plan.right)) {
            right = sample;
            break;
          }
          sample.close();
          owned.pop();
        }
        current();
        if (!right) return null;
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
      context.globalAlpha = blend.black;
      context.fillRect(0, 0, size.width, size.height);
    } else {
      draw(before ? current : frames.left);
      context.globalAlpha = blend.incoming;
      draw(before ? frames.right : current);
    }
  } finally {
    context.restore();
  }
}
