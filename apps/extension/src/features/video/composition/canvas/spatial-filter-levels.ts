import type { QuickEditHomography } from '../motion/spatial-geometry';

type FilterInput = {
  inverse: QuickEditHomography;
  output: { width: number; height: number };
  precision: number;
  blurWeights: readonly number[];
};

function validFilterInput(args: FilterInput) {
  const validSize = [args.output.width, args.output.height].every(
    (value) => Number.isSafeInteger(value) && value > 0
  );
  return (
    validSize &&
    Number.isInteger(args.precision) &&
    args.precision >= 16 &&
    args.precision <= 32 &&
    args.blurWeights.every(Number.isFinite)
  );
}

function finiteHomography(values: readonly number[]): values is QuickEditHomography {
  return values.length === 9 && values.every(Number.isFinite);
}

function endpointMagnitude(slope: number, intercept: number, end: number) {
  return Math.max(Math.abs(intercept), Math.abs(slope * end + intercept));
}

function quotientRoundingError(
  magnitude: number,
  denominator: number,
  error: number,
  epsilon: number
) {
  const safeDenominator = denominator - error;
  const numeratorError = 16 * epsilon * magnitude;
  return (
    numeratorError / safeDenominator +
    (magnitude * error) / (denominator * safeDenominator) +
    (4 * epsilon * (magnitude + numeratorError)) / safeDenominator
  );
}

/** Includes neighboring finite-step reads and conservative fragment arithmetic rounding. */
function footprintUpperBound(
  matrix: QuickEditHomography,
  output: FilterInput['output'],
  epsilon: number
) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const x = output.width + 1;
  const y = output.height + 1;
  const denominator = Math.min(i, g * x + i, h * y + i, g * x + h * y + i);
  const denominatorMagnitude = Math.abs(g) * x + Math.abs(h) * y + Math.abs(i);
  const error = 16 * epsilon * denominatorMagnitude;
  if (!Number.isFinite(denominator) || denominator <= Math.max(0.000001, 2 * error))
    return Infinity;
  // Each exact one-pixel difference numerator is affine on the other coordinate.
  const dx = Math.hypot(
    endpointMagnitude(a * h - g * b, a * i - g * c, y),
    endpointMagnitude(d * h - g * e, d * i - g * f, y)
  );
  const dy = Math.hypot(
    endpointMagnitude(b * g - h * a, b * i - h * c, x),
    endpointMagnitude(e * g - h * d, e * i - h * f, x)
  );
  const numeratorX = Math.abs(a) * x + Math.abs(b) * y + Math.abs(c);
  const numeratorY = Math.abs(d) * x + Math.abs(e) * y + Math.abs(f);
  const subtractionError =
    (4 * epsilon * Math.hypot(numeratorX, numeratorY)) / (denominator - error);
  const quotientError = Math.hypot(
    quotientRoundingError(numeratorX, denominator, error, epsilon),
    quotientRoundingError(numeratorY, denominator, error, epsilon)
  );
  return (
    (Math.max(dx, dy) / (denominator * denominator) + 2 * quotientError + subtractionError) *
    (1 + 8 * epsilon)
  );
}

/** A finite-step footprint bound for the exact inverse projection used by the fragment shader. */
export function resolveReviewSpatialFilterLevels(args: FilterInput) {
  if (!validFilterInput(args)) return 8;
  const matrix = args.inverse.map(Math.fround);
  if (!finiteHomography(matrix)) return 8;
  const epsilon = 2 ** -Math.min(23, args.precision);
  const footprint = footprintUpperBound(matrix, args.output, epsilon);
  // smoothstep contributes at most one times each nonnegative, float32 focus weight.
  const weight = args.blurWeights.reduce((sum, value) => sum + Math.max(0, Math.fround(value)), 0);
  const blur = ((weight * 24 * args.output.width) / 1920) * (1 + 16 * epsilon);
  const bound = Math.max(footprint, blur) * (1 + 1e-10);
  if (!Number.isFinite(bound)) return 8;
  if (bound <= 1) return 1;
  return Math.min(8, Math.max(2, Math.ceil(Math.log2(bound)) + 1));
}
