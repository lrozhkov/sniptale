import type { EnhancementRect } from './region-plan';

function largestSingularValue(a: number, b: number, c: number, d: number) {
  const sum = a * a + b * b + c * c + d * d;
  return Math.sqrt((sum + Math.sqrt(Math.max(0, sum * sum - 4 * (a * d - b * c) ** 2))) / 2);
}

function isHomography(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

/** H отображает исходные пиксели в пиксели вывода. Видимый ROI задаёт существующий владелец проекции. */
export function projectedDensityBound(matrix: readonly number[], roi: EnhancementRect) {
  if (!isHomography(matrix)) throw new TypeError('Invalid homography');
  if (
    ![roi.x, roi.y, roi.width, roi.height].every(Number.isFinite) ||
    roi.width <= 0 ||
    roi.height <= 0
  )
    throw new TypeError('Invalid projection ROI');
  const a = matrix[0]!;
  const b = matrix[1]!;
  const c = matrix[2]!;
  const d = matrix[3]!;
  const e = matrix[4]!;
  const f = matrix[5]!;
  const g = matrix[6]!;
  const h = matrix[7]!;
  const i = matrix[8]!;
  if (g === 0 && h === 0) {
    if (i <= 1e-8) throw new RangeError('Projection behind camera');
    return largestSingularValue(a / i, b / i, d / i, e / i);
  }
  const xs = [roi.x, roi.x + roi.width],
    ys = [roi.y, roi.y + roi.height];
  const ws = xs.flatMap((x) => ys.map((y) => g * x + h * y + i));
  const minimum = Math.min(...ws);
  if (minimum <= 1e-8) throw new RangeError('ROI crosses projection horizon');
  const denominator = minimum * minimum;
  const bound = (k: number, v: number, points: number[]) =>
    Math.max(...points.map((p) => Math.abs(k * p + v))) / denominator;
  // Покомпонентная граница |Jacobian| даёт верхнюю границу его спектральной нормы.
  return largestSingularValue(
    bound(a * h - g * b, a * i - g * c, ys),
    bound(b * g - h * a, b * i - h * c, xs),
    bound(d * h - g * e, d * i - g * f, ys),
    bound(e * g - h * d, e * i - h * f, xs)
  );
}

/** Для плоской линзы scale — увеличение относительно уже спроецированной плоскости. */
export function samplingRasterSize({
  roi,
  projection,
  lensScale = 1,
}: {
  roi: EnhancementRect;
  projection: readonly number[];
  lensScale?: number;
}) {
  if (!Number.isFinite(lensScale) || lensScale < 1) throw new RangeError('Invalid lens scale');
  const density = projectedDensityBound(projection, roi) * lensScale;
  if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid raster density');
  return {
    density,
    width: Math.max(1, Math.ceil(roi.width * density)),
    height: Math.max(1, Math.ceil(roi.height * density)),
  };
}
