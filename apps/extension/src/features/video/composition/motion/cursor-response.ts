import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
  type CameraPanPoint,
  type CameraTrajectory,
} from './camera-trajectory';

interface Observation extends CameraPanPoint {
  time: number;
  segmentId?: string;
}
interface Jet {
  position: CameraPanPoint;
  velocity: CameraPanPoint;
  acceleration: CameraPanPoint;
}
interface Piece {
  start: number;
  target: CameraPanPoint;
  slope: CameraPanPoint;
  position: CameraPanPoint;
  velocity: CameraPanPoint;
}
interface ResponseRun {
  start: number;
  end: number;
  pieces: readonly Piece[];
  knots: readonly number[];
  omega: number;
}
const zero = (): CameraPanPoint => ({ x: 0, y: 0 });

function evaluatePiece(piece: Piece, time: number, omega: number): Jet {
  const elapsed = Math.max(0, time - piece.start),
    decay = Math.exp(-omega * elapsed);
  const axis = (key: 'x' | 'y') => {
    const slope = piece.slope[key];
    const a = piece.position[key] - piece.target[key] + (2 * slope) / omega;
    const b = piece.velocity[key] - slope + omega * a;
    const transient = a + b * elapsed;
    return {
      position: piece.target[key] + slope * elapsed - (2 * slope) / omega + transient * decay,
      velocity: slope + (b - omega * transient) * decay,
      acceleration: (omega * omega * transient - 2 * omega * b) * decay,
    };
  };
  const x = axis('x'),
    y = axis('y');
  return {
    position: { x: x.position, y: y.position },
    velocity: { x: x.velocity, y: y.velocity },
    acceleration: { x: x.acceleration, y: y.acceleration },
  };
}

function responseRun(points: readonly Observation[], omega: number): ResponseRun {
  const pieces: Piece[] = [];
  let position = { x: points[0]!.x, y: points[0]!.y },
    velocity = zero();
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!,
      next = points[index + 1];
    const duration = next ? next.time - point.time : 0;
    const slope =
      duration > 0
        ? { x: (next!.x - point.x) / duration, y: (next!.y - point.y) / duration }
        : zero();
    const piece = {
      start: point.time,
      target: { x: point.x, y: point.y },
      slope,
      position,
      velocity,
    };
    pieces.push(piece);
    if (next) {
      const end = evaluatePiece(piece, next.time, omega);
      position = end.position;
      velocity = end.velocity;
    }
  }
  return {
    start: points[0]!.time,
    end: points.at(-1)!.time,
    pieces,
    knots: points.map((point) => point.time),
    omega,
  };
}

/** Immutable analytic response to piecewise-linear input; each capture run owns its independent history. */
export function createCursorResponse(observations: readonly Observation[], omega: number) {
  const groups: Observation[][] = [];
  for (const point of observations
    .filter(
      (point) => Number.isFinite(point.time) && Number.isFinite(point.x) && Number.isFinite(point.y)
    )
    .toSorted((a, b) => a.time - b.time)) {
    const group = groups.at(-1),
      previous = group?.at(-1);
    if (!group || previous?.segmentId !== point.segmentId) groups.push([point]);
    else if (previous?.time === point.time) group[group.length - 1] = point;
    else group.push(point);
  }
  return groups.map((group) => responseRun(group, omega));
}

function evaluateRun(run: ResponseRun, time: number): Jet {
  let low = 0,
    high = run.pieces.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (run.pieces[middle]!.start <= time) low = middle + 1;
    else high = middle;
  }
  return evaluatePiece(run.pieces[Math.max(0, low - 1)]!, time, run.omega);
}

function fitResponseRun(
  run: ResponseRun,
  start: number,
  end: number,
  lookahead: number,
  spans: CameraTrajectory[]
) {
  const at = (time: number) => evaluateRun(run, Math.max(run.start, time + lookahead));
  const from = at(start),
    to = at(end);
  const trajectory = createCameraTrajectory({
    start,
    end,
    from: from.position,
    to: to.position,
    fromVelocity: from.velocity,
    toVelocity: to.velocity,
    fromAcceleration: from.acceleration,
    toAcceleration: to.acceleration,
  });
  const checks = [start + (end - start) * 0.25, (start + end) / 2, start + (end - start) * 0.75];
  let low = 0,
    high = run.knots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (run.knots[middle]! - lookahead <= start) low = middle + 1;
    else high = middle;
  }
  for (let index = low; index < run.knots.length; index++) {
    const time = run.knots[index]! - lookahead;
    if (time >= end) break;
    checks.push(time);
  }
  let worst = 0,
    split = (start + end) / 2;
  for (const time of checks) {
    const exact = at(time),
      position = evaluateCameraTrajectory(trajectory, time),
      velocity = evaluateCameraTrajectoryDerivative(trajectory, time, 1);
    const error = Math.max(
      Math.hypot(position.x - exact.position.x, position.y - exact.position.y) / 0.05,
      Math.hypot(velocity.x - exact.velocity.x, velocity.y - exact.velocity.y) / 0.2
    );
    if (error > worst) {
      worst = error;
      split = time;
    }
  }
  if (worst <= 1 || end - start <= 1e-6) {
    spans.push(trajectory);
    return;
  }
  fitResponseRun(run, start, split, lookahead, spans);
  fitResponseRun(run, split, end, lookahead, spans);
}

/** Compile sparse C2 quintics. Rendering and safety consume these exact polynomials, not sampled spring state. */
export function compileCursorResponse(
  response: ReturnType<typeof createCursorResponse>,
  start: number,
  end: number,
  lookahead = 0.25
) {
  const spans: CameraTrajectory[] = [];
  for (let index = 0; index < response.length; index++) {
    const run = response[index]!,
      next = response[index + 1];
    const low = index === 0 ? start : Math.max(start, run.start),
      high = Math.min(end, next?.start ?? end);
    if (high > low) fitResponseRun(run, low, high, lookahead, spans);
  }
  return spans;
}
