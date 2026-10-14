import { cameraTrajectoryBounds } from '../../composition/motion/camera-trajectory';
import type { CameraPanBounds, CameraTrajectory } from '../../composition/motion/camera-trajectory';
import type { CameraProjectionProof } from '../../composition/motion/camera-plan-proof';
import type { QuickEditRect } from './scene';

type Range = readonly [number, number];
type Derivatives = readonly [Range, Range, Range];
interface ProjectionJet {
  value: Range;
  derivatives: Derivatives;
}
const ZERO: Range = [0, 0];
const zeros: Derivatives = [ZERO, ZERO, ZERO];
const range = (low: number, high = low): Range => {
  const error = 1e-12 * Math.max(1, Math.abs(low), Math.abs(high));
  return [low - error, high + error];
};
const plus = (a: Range, b: Range) => range(a[0] + b[0], a[1] + b[1]);
const negative = (a: Range): Range => [-a[1], -a[0]];
const times = (a: Range, b: Range) => {
  const products = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return range(Math.min(...products), Math.max(...products));
};
const constant = (value: number): ProjectionJet => ({ value: [value, value], derivatives: zeros });
const boxed = (value: Range): ProjectionJet => ({ value, derivatives: zeros });
const stationary = (a: ProjectionJet) => a.derivatives === zeros;
const add = (a: ProjectionJet, b: ProjectionJet): ProjectionJet =>
  stationary(a) && stationary(b)
    ? boxed(plus(a.value, b.value))
    : {
        value: plus(a.value, b.value),
        derivatives: [
          plus(a.derivatives[0], b.derivatives[0]),
          plus(a.derivatives[1], b.derivatives[1]),
          plus(a.derivatives[2], b.derivatives[2]),
        ],
      };
const negate = (a: ProjectionJet): ProjectionJet =>
  stationary(a)
    ? boxed(negative(a.value))
    : {
        value: negative(a.value),
        derivatives: [
          negative(a.derivatives[0]),
          negative(a.derivatives[1]),
          negative(a.derivatives[2]),
        ],
      };
const subtract = (a: ProjectionJet, b: ProjectionJet) => add(a, negate(b));
const binomial = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]];

function multiply(a: ProjectionJet, b: ProjectionJet): ProjectionJet {
  if (stationary(a) && stationary(b)) return boxed(times(a.value, b.value));
  const av = [a.value, ...a.derivatives],
    bv = [b.value, ...b.derivatives];
  const derivatives: Range[] = [];
  for (let order = 1; order <= 3; order++) {
    let derivative = ZERO;
    for (let index = 0; index <= order; index++) {
      const coefficient = binomial[order]![index]!;
      derivative = plus(
        derivative,
        times([coefficient, coefficient], times(av[index]!, bv[order - index]!))
      );
    }
    derivatives.push(derivative);
  }
  return {
    value: times(a.value, b.value),
    derivatives: [derivatives[0]!, derivatives[1]!, derivatives[2]!],
  };
}

function unary(a: ProjectionJet, value: Range, derivatives: Derivatives): ProjectionJet {
  if (stationary(a)) return boxed(value);
  const [a1, a2, a3] = a.derivatives;
  const [g1, g2, g3] = derivatives;
  return {
    value,
    derivatives: [
      times(g1, a1),
      plus(times(g1, a2), times(g2, times(a1, a1))),
      plus(
        plus(times(g1, a3), times([3, 3], times(g2, times(a1, a2)))),
        times(g3, times(times(a1, a1), a1))
      ),
    ],
  };
}

function trigRange(value: Range, cosine: boolean): Range {
  if (value[1] - value[0] >= Math.PI * 2) return [-1, 1];
  const fn = cosine ? Math.cos : Math.sin;
  const values = [fn(value[0]), fn(value[1])];
  const origin = cosine ? 0 : Math.PI / 2;
  for (
    let index = Math.ceil((value[0] - origin) / Math.PI);
    origin + index * Math.PI <= value[1];
    index++
  )
    values.push(index % 2 === 0 ? 1 : -1);
  return range(Math.min(...values), Math.max(...values));
}
function sine(a: ProjectionJet) {
  const s = trigRange(a.value, false),
    c = trigRange(a.value, true);
  return unary(a, s, [c, negative(s), negative(c)]);
}
function cosine(a: ProjectionJet) {
  const s = trigRange(a.value, false),
    c = trigRange(a.value, true);
  return unary(a, c, [negative(s), negative(c), s]);
}
function reciprocal(a: ProjectionJet) {
  if (a.value[0] <= 0 && a.value[1] >= 0) return null;
  const value = range(1 / a.value[1], 1 / a.value[0]);
  const square = times(value, value),
    cube = times(square, value),
    fourth = times(cube, value);
  return unary(a, value, [negative(square), times([2, 2], cube), times([-6, -6], fourth)]);
}

function trajectoryJet(
  trajectory: CameraTrajectory,
  axis: 'x' | 'y',
  start: number,
  end: number
): ProjectionJet {
  const values = [0, 1, 2, 3].map((order) => {
    const bounds = cameraTrajectoryBounds(
      trajectory,
      start,
      end,
      order === 0 ? 0 : order === 1 ? 1 : order === 2 ? 2 : 3
    );
    return axis === 'x' ? range(bounds.minX, bounds.maxX) : range(bounds.minY, bounds.maxY);
  });
  const derivatives: Derivatives = [values[1]!, values[2]!, values[3]!];
  return { value: values[0]!, derivatives };
}

export interface QuickEditCameraProjectionInterval {
  start: number;
  end: number;
  window: QuickEditRect;
  video: QuickEditRect;
  output: { width: number; height: number };
  cornerRadius: number;
  targetScale: number;
  phase: number | CameraTrajectory;
  pan: CameraPanBounds;
  trajectory?: CameraTrajectory;
  windowWeight: 'window' | 'content' | 'spatial';
  perspective: { rotateX: number; rotateY: number; rotateZ: number; strength: number };
  /** Frozen rendered link endpoint; absence means the identity camera. */
  from?: {
    scale: number;
    pan: { x: number; y: number };
    perspective: { rotateX: number; rotateY: number; rotateZ: number; strength: number };
    windowMotion: number;
  };
  targetWindowMotion?: number;
  actual?: { from: { x: number; y: number }; to: { x: number; y: number } };
}

function roundedClearance(x: Range, y: Range, width: number, height: number, cornerRadius: number) {
  const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));
  const absolute = (value: Range, center: number): Range => {
    const shifted: Range = [value[0] - center, value[1] - center];
    return [
      shifted[0] <= 0 && shifted[1] >= 0 ? 0 : Math.min(Math.abs(shifted[0]), Math.abs(shifted[1])),
      Math.max(Math.abs(shifted[0]), Math.abs(shifted[1])),
    ];
  };
  const ax = absolute(x, width / 2),
    ay = absolute(y, height / 2);
  const distance = (dx: number, dy: number) =>
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
  return {
    low: -distance(ax[1] - width / 2 + radius, ay[1] - height / 2 + radius),
    high: -distance(ax[0] - width / 2 + radius, ay[0] - height / 2 + radius),
  };
}

function nominalCameraJets(input: QuickEditCameraProjectionInterval, motion: boolean) {
  const phaseBounds =
    typeof input.phase === 'number'
      ? null
      : cameraTrajectoryBounds(input.phase, input.start, input.end);
  const g =
    typeof input.phase === 'number'
      ? constant(input.phase)
      : motion
        ? trajectoryJet(input.phase, 'x', input.start, input.end)
        : boxed([phaseBounds!.minX, phaseBounds!.maxX]);
  const pan = (axis: 'x' | 'y') =>
    motion && input.trajectory
      ? trajectoryJet(input.trajectory, axis, input.start, input.end)
      : boxed(axis === 'x' ? [input.pan.minX, input.pan.maxX] : [input.pan.minY, input.pan.maxY]);
  const startScale = input.from?.scale ?? 1;
  const translation = (axis: 'x' | 'y') => {
    const start = constant(input.from?.pan[axis] ?? 0);
    return add(start, multiply(g, subtract(pan(axis), start)));
  };
  const tx = translation('x'),
    ty = translation('y');
  const scale = add(constant(startScale), multiply(constant(input.targetScale - startScale), g));
  const startWeight = input.from?.windowMotion ?? 0;
  const weight =
    input.windowWeight === 'window'
      ? constant(1)
      : input.windowWeight === 'content'
        ? constant(0)
        : add(
            constant(startWeight),
            multiply(constant((input.targetWindowMotion ?? 1) - startWeight), g)
          );
  const k = add(constant(1), multiply(weight, subtract(scale, constant(1))));
  const inverseK = reciprocal(k);
  if (!inverseK) return null;
  return { g, tx, ty, scale, weight, k, inverseK, translation };
}

function cameraRasterCoordinate(
  input: QuickEditCameraProjectionInterval,
  motion: boolean,
  jets: NonNullable<ReturnType<typeof nominalCameraJets>>,
  axis: 'x' | 'y'
) {
  const { window: windowRect, video } = input;
  const size = axis === 'x' ? 'width' : 'height';
  const translation = axis === 'x' ? jets.tx : jets.ty;
  const actual = !motion ? input.actual : undefined;
  const p: Range = actual
    ? [Math.min(actual.from[axis], actual.to[axis]), Math.max(actual.from[axis], actual.to[axis])]
    : [0, 1];
  const source = add(
    constant(video[axis] - windowRect[axis]),
    multiply(boxed(p), constant(video[size]))
  );
  const q =
    input.windowWeight === 'window'
      ? source
      : multiply(
          subtract(
            multiply(jets.scale, source),
            multiply(subtract(constant(1), jets.weight), translation)
          ),
          jets.inverseK
        );
  // Tighten visible values. Keep derivatives for the source transform.
  if (motion || !input.actual)
    q.value = [Math.max(0, q.value[0]), Math.min(windowRect[size], q.value[1])];
  return q;
}

function unrotatedOutputCoordinate(
  input: QuickEditCameraProjectionInterval,
  motion: boolean,
  jets: NonNullable<ReturnType<typeof nominalCameraJets>>,
  axis: 'x' | 'y'
) {
  const { window: windowRect, video } = input;
  const size = axis === 'x' ? 'width' : 'height';
  const actual = !motion ? input.actual : undefined;
  const p: Range = actual
    ? [Math.min(actual.from[axis], actual.to[axis]), Math.max(actual.from[axis], actual.to[axis])]
    : [0, 1];
  const source = add(
    constant(video[axis] - windowRect[axis]),
    multiply(boxed(p), constant(video[size]))
  );
  return add(
    constant(windowRect[axis]),
    subtract(multiply(jets.scale, source), jets.translation(axis))
  );
}

function projectInterval(input: QuickEditCameraProjectionInterval, motion: boolean) {
  const { window: windowRect } = input;
  const jets = nominalCameraJets(input, motion);
  if (!jets) return null;
  const { g, tx, ty, weight, k } = jets;
  const qx = cameraRasterCoordinate(input, motion, jets, 'x'),
    qy = cameraRasterCoordinate(input, motion, jets, 'y');
  if (qx.value[0] > qx.value[1] || qy.value[0] > qy.value[1]) return null;
  const angle = (axis: 'rotateX' | 'rotateY' | 'rotateZ') => {
    const start = input.from?.perspective[axis] ?? 0;
    const delta = input.perspective[axis] - start;
    const arc = axis === 'rotateZ' ? ((delta + 540) % 360) - 180 : delta;
    return multiply(constant(Math.PI / 180), add(constant(start), multiply(constant(arc), g)));
  };
  const sx = sine(angle('rotateX')),
    cx = cosine(angle('rotateX'));
  const sy = sine(angle('rotateY')),
    cy = cosine(angle('rotateY'));
  const sz = sine(angle('rotateZ')),
    cz = cosine(angle('rotateZ'));
  const r00 = multiply(cz, cy),
    r01 = subtract(multiply(multiply(cz, sy), sx), multiply(sz, cx));
  const r10 = multiply(sz, cy),
    r11 = add(multiply(multiply(sz, sy), sx), multiply(cz, cx));
  const r20 = negate(sy),
    r21 = multiply(cy, sx);
  const x = subtract(qx, constant(windowRect.width / 2)),
    y = subtract(qy, constant(windowRect.height / 2));
  const startStrength = input.from?.perspective.strength ?? 0;
  const focal = multiply(
    constant(0.7 / Math.hypot(windowRect.width, windowRect.height)),
    add(constant(startStrength), multiply(constant(input.perspective.strength - startStrength), g))
  );
  const denominator = subtract(
    constant(1),
    multiply(focal, add(multiply(r20, x), multiply(r21, y)))
  );
  const inverseDenominator = reciprocal(denominator);
  if (!inverseDenominator) return null;
  const center = (origin: number, size: number, translation: ProjectionJet) =>
    add(subtract(constant(origin), multiply(weight, translation)), multiply(k, constant(size / 2)));
  const outX = add(
    center(windowRect.x, windowRect.width, tx),
    multiply(multiply(k, add(multiply(r00, x), multiply(r01, y))), inverseDenominator)
  );
  const outY = add(
    center(windowRect.y, windowRect.height, ty),
    multiply(multiply(k, add(multiply(r10, x), multiply(r11, y))), inverseDenominator)
  );
  if (
    input.perspective.rotateX === 0 &&
    input.perspective.rotateY === 0 &&
    input.perspective.rotateZ === 0 &&
    (!input.from ||
      (input.from.perspective.rotateX === 0 &&
        input.from.perspective.rotateY === 0 &&
        input.from.perspective.rotateZ === 0))
  ) {
    return {
      qx,
      qy,
      denominator,
      outX: unrotatedOutputCoordinate(input, motion, jets, 'x'),
      outY: unrotatedOutputCoordinate(input, motion, jets, 'y'),
    };
  }
  return { qx, qy, outX, outY, denominator };
}

/** Conservative real raster and output bounds, including nominal phases and projective tilt. */
export function boundQuickEditCameraProjection(
  input: QuickEditCameraProjectionInterval
): CameraProjectionProof | null {
  const result = projectInterval(input, false);
  if (!result) return null;
  const poseLow = Math.min(
    input.pan.minX,
    input.pan.minY,
    (input.targetScale - 1) * input.window.width - input.pan.maxX,
    (input.targetScale - 1) * input.window.height - input.pan.maxY
  );
  const poseHigh = Math.min(
    input.pan.maxX,
    input.pan.maxY,
    (input.targetScale - 1) * input.window.width - input.pan.minX,
    (input.targetScale - 1) * input.window.height - input.pan.minY
  );
  const { outX, outY } = result;
  return {
    pose: { low: poseLow, high: poseHigh },
    denominator: { low: result.denominator.value[0], high: result.denominator.value[1] },
    ...(input.actual
      ? {
          raster: roundedClearance(
            result.qx.value,
            result.qy.value,
            input.window.width,
            input.window.height,
            input.cornerRadius
          ),
          viewport: {
            low: Math.min(
              outX.value[0],
              outY.value[0],
              input.output.width - outX.value[1],
              input.output.height - outY.value[1]
            ),
            high: Math.min(
              outX.value[1],
              outY.value[1],
              input.output.width - outX.value[0],
              input.output.height - outY.value[0]
            ),
          },
        }
      : {}),
  };
}

/** Bound total final screen movement, including authored nominal zoom and follow pan. */
export function boundQuickEditCameraMotion(input: QuickEditCameraProjectionInterval) {
  if (!input.trajectory && typeof input.phase === 'number')
    return { speed: 0, acceleration: 0, jerk: 0 };
  const result = projectInterval(input, true);
  if (!result) return null;
  const norm = (order: 0 | 1 | 2) => {
    const x = result.outX.derivatives[order];
    const y = result.outY.derivatives[order];
    return Math.hypot(
      Math.max(Math.abs(x[0]), Math.abs(x[1])),
      Math.max(Math.abs(y[0]), Math.abs(y[1]))
    );
  };
  return { speed: norm(0), acceleration: norm(1), jerk: norm(2) };
}
