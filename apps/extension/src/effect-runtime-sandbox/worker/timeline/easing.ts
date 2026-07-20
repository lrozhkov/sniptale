type BezierHandles = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

export function resolveTimelineEase(
  keyframe: { easing?: string; handles?: unknown },
  progress: number
): number {
  if (keyframe?.easing === 'hold') {
    return progress >= 1 ? 1 : 0;
  }
  if (keyframe?.easing === 'bezier') {
    return cubicBezierYForX(keyframe.handles, progress);
  }
  return ease(keyframe.easing ?? 'linear', progress);
}

export function cubicBezierYForX(handles: unknown, x: number): number {
  const normalized = normalizeBezierHandles(handles);
  let low = 0;
  let high = 1;
  let t = clamp(x, 0, 1);
  for (let index = 0; index < 14; index += 1) {
    t = (low + high) * 0.5;
    const sampleX = cubicBezier(0, normalized.x1, normalized.x2, 1, t);
    if (sampleX < x) {
      low = t;
    } else {
      high = t;
    }
  }
  return cubicBezier(0, normalized.y1, normalized.y2, 1, t);
}

export function ease(name: string, progress: number): number {
  const p = clamp(progress, 0, 1);
  if (name === 'in') return p * p * p;
  if (name === 'out') return 1 - Math.pow(1 - p, 3);
  if (name === 'back') {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }
  if (name === 'inOut') {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
  return p;
}

function normalizeBezierHandles(handles: unknown): BezierHandles {
  if (!isRecord(handles)) {
    return { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
  }
  return {
    x1: clamp(Number(handles['x1']) || 0, 0, 1),
    x2: clamp(Number(handles['x2']) || 0, 0, 1),
    y1: clamp(Number(handles['y1']) || 0, 0, 1),
    y2: clamp(Number(handles['y2']) || 0, 0, 1),
  };
}

function cubicBezier(a: number, b: number, c: number, d: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
