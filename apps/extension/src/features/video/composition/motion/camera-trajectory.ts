export interface CameraPanPoint {
  x: number;
  y: number;
}

/** Pan at nominal target zoom, in output pixels. Endpoint derivatives use output seconds. */
export interface CameraTrajectory {
  start: number;
  end: number;
  controls: readonly CameraPanPoint[];
}

export interface CameraPanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const ZERO: CameraPanPoint = { x: 0, y: 0 };
const unit = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: CameraPanPoint, b: CameraPanPoint, t: number): CameraPanPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Construct one quintic transition with prescribed position, velocity, and acceleration at both boundaries. */
export function createCameraTrajectory(input: {
  start: number;
  end: number;
  from: CameraPanPoint;
  to: CameraPanPoint;
  fromVelocity?: CameraPanPoint;
  toVelocity?: CameraPanPoint;
  fromAcceleration?: CameraPanPoint;
  toAcceleration?: CameraPanPoint;
}): CameraTrajectory {
  const duration = input.end - input.start;
  if (!Number.isFinite(input.start) || !Number.isFinite(duration) || duration <= 0)
    throw new Error('Camera transition requires a positive finite duration.');
  const v0 = input.fromVelocity ?? ZERO;
  const v1 = input.toVelocity ?? ZERO;
  const a0 = input.fromAcceleration ?? ZERO;
  const a1 = input.toAcceleration ?? ZERO;
  const controls = [
    { ...input.from },
    { x: input.from.x + (v0.x * duration) / 5, y: input.from.y + (v0.y * duration) / 5 },
    {
      x: input.from.x + (2 * v0.x * duration) / 5 + (a0.x * duration ** 2) / 20,
      y: input.from.y + (2 * v0.y * duration) / 5 + (a0.y * duration ** 2) / 20,
    },
    {
      x: input.to.x - (2 * v1.x * duration) / 5 + (a1.x * duration ** 2) / 20,
      y: input.to.y - (2 * v1.y * duration) / 5 + (a1.y * duration ** 2) / 20,
    },
    { x: input.to.x - (v1.x * duration) / 5, y: input.to.y - (v1.y * duration) / 5 },
    { ...input.to },
  ];
  if (controls.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
    throw new Error('Camera transition requires finite boundary values.');
  return { start: input.start, end: input.end, controls };
}

function evaluate(controls: readonly CameraPanPoint[], progress: number): CameraPanPoint {
  let row = controls.map((point) => ({ ...point }));
  while (row.length > 1)
    row = row.slice(0, -1).map((point, index) => mix(point, row[index + 1]!, progress));
  return row[0]!;
}

function derivativeControls(trajectory: CameraTrajectory, order: number): CameraPanPoint[] {
  let controls = [...trajectory.controls];
  for (let derivative = 0; derivative < order; derivative++) {
    const factor = (controls.length - 1) / (trajectory.end - trajectory.start);
    controls = controls.slice(0, -1).map((point, index) => ({
      x: (controls[index + 1]!.x - point.x) * factor,
      y: (controls[index + 1]!.y - point.y) * factor,
    }));
  }
  return controls;
}

/** Evaluate a pan without position clamps or dependence on preceding calls. */
export function evaluateCameraTrajectory(
  trajectory: CameraTrajectory,
  time: number
): CameraPanPoint {
  return evaluate(
    trajectory.controls,
    unit((time - trajectory.start) / (trajectory.end - trajectory.start))
  );
}

/** Evaluate a derivative in output-pixel units and output seconds. */
export function evaluateCameraTrajectoryDerivative(
  trajectory: CameraTrajectory,
  time: number,
  order: 1 | 2 | 3
): CameraPanPoint {
  return evaluate(
    derivativeControls(trajectory, order),
    unit((time - trajectory.start) / (trajectory.end - trajectory.start))
  );
}

function split(controls: readonly CameraPanPoint[], progress: number) {
  const left = [controls[0]!];
  const right = [controls.at(-1)!];
  let row = [...controls];
  while (row.length > 1) {
    row = row.slice(0, -1).map((point, index) => mix(point, row[index + 1]!, progress));
    left.push(row[0]!);
    right.unshift(row.at(-1)!);
  }
  return { left, right };
}

function intervalControls(controls: readonly CameraPanPoint[], start: number, end: number) {
  if (start === end) return [evaluate(controls, start)];
  const prefix = end === 1 ? controls : split(controls, end).left;
  return start === 0 ? prefix : split(prefix, start / end).right;
}

/** Bound the complete interval with its Bezier hull, including extrema between sampled frames. */
export function cameraTrajectoryBounds(
  trajectory: CameraTrajectory,
  start = trajectory.start,
  end = trajectory.end,
  derivativeOrder: 0 | 1 | 2 | 3 = 0
): CameraPanBounds {
  if (end < start) throw new Error('Camera bounds require an ordered interval.');
  const duration = trajectory.end - trajectory.start;
  const controls = intervalControls(
    derivativeControls(trajectory, derivativeOrder),
    unit((start - trajectory.start) / duration),
    unit((end - trajectory.start) / duration)
  );
  return {
    minX: Math.min(...controls.map(({ x }) => x)),
    maxX: Math.max(...controls.map(({ x }) => x)),
    minY: Math.min(...controls.map(({ y }) => y)),
    maxY: Math.max(...controls.map(({ y }) => y)),
  };
}

function derivativePeakBound(trajectory: CameraTrajectory, order: 1 | 2 | 3) {
  let intervals = [derivativeControls(trajectory, order)];
  // Six splits produce 64 complete hulls. Their union still bounds every continuous-time extremum.
  for (let depth = 0; depth < 6; depth++)
    intervals = intervals.flatMap((controls) => {
      const halves = split(controls, 0.5);
      return [halves.left, halves.right];
    });
  return Math.max(...intervals.flatMap((controls) => controls.map(({ x, y }) => Math.hypot(x, y))));
}

/** Conservative continuous-time dynamics. The planner can enlarge duration before admission. */
export function cameraTrajectoryDynamics(trajectory: CameraTrajectory) {
  return {
    speed: derivativePeakBound(trajectory, 1),
    acceleration: derivativePeakBound(trajectory, 2),
    jerk: derivativePeakBound(trajectory, 3),
  };
}
