import type { CameraPanPoint } from './camera-trajectory';

interface CameraZoneObservation extends CameraPanPoint {
  time: number;
  segmentId: string;
  preferenceWeight?: number;
}

export interface CameraWorkingZone {
  start: number;
  end: number;
  segmentId: string;
  first: number;
  last: number;
  preferred: CameraPanPoint;
}

/** Combine adjacent compatible areas using their complete elapsed-time preference. */
export function mergeCameraWorkingZones(
  left: CameraWorkingZone,
  right: CameraWorkingZone,
  observations: readonly CameraZoneObservation[]
): CameraWorkingZone {
  if (left.segmentId !== right.segmentId || left.last + 1 !== right.first)
    throw new Error('Camera zone merging requires adjacent observations from one source run.');
  return {
    ...left,
    end: right.end,
    last: right.last,
    preferred: activityCenter(observations, left.first, right.last),
  };
}

function activityCenter(
  observations: readonly CameraZoneObservation[],
  first: number,
  last: number
) {
  let duration = 0;
  let x = 0;
  let y = 0;
  for (let index = first; index < last; index++) {
    const a = observations[index]!;
    const b = observations[index + 1]!;
    const elapsed = b.time - a.time;
    const wa = a.preferenceWeight ?? 1,
      wb = b.preferenceWeight ?? 1;
    duration += (elapsed * (wa + wb)) / 2;
    // Integrate the product of linear position and linear preference weight exactly.
    x += (elapsed * (2 * a.x * wa + a.x * wb + b.x * wa + 2 * b.x * wb)) / 6;
    y += (elapsed * (2 * a.y * wa + a.y * wb + b.y * wa + 2 * b.y * wb)) / 6;
  }
  const firstPoint = observations[first]!;
  return duration > 0 ? { x: x / duration, y: y / duration } : { x: firstPoint.x, y: firstPoint.y };
}

/** Measure one complete candidate interval without changing observation or authoring values. */
export function createCameraWorkingZone(
  observations: readonly CameraZoneObservation[],
  first: number,
  last: number
): CameraWorkingZone {
  const initial = observations[first]!,
    final = observations[last]!;
  return {
    first,
    last,
    start: initial.time,
    end: final.time,
    segmentId: initial.segmentId,
    preferred: activityCenter(observations, first, last),
  };
}

/** Group the complete interval by viewport-relative spread, independent of sample count and nominal zoom. */
export function groupCameraWorkingZones(
  observations: readonly CameraZoneObservation[],
  viewport: { width: number; height: number },
  zoneSize: number
): CameraWorkingZone[] {
  if (!(viewport.width > 0 && viewport.height > 0 && zoneSize > 0 && zoneSize <= 1))
    throw new Error('Camera zones require a positive viewport and a size between zero and one.');
  const result: CameraWorkingZone[] = [];
  let first = 0;
  while (first < observations.length) {
    const initial = observations[first]!;
    let last = first;
    let minX = initial.x;
    let maxX = initial.x;
    let minY = initial.y;
    let maxY = initial.y;
    while (last + 1 < observations.length) {
      const next = observations[last + 1]!;
      if (next.segmentId !== initial.segmentId) break;
      if (next.time <= observations[last]!.time)
        throw new Error('Camera observations require increasing output times.');
      const bounds = {
        minX: Math.min(minX, next.x),
        maxX: Math.max(maxX, next.x),
        minY: Math.min(minY, next.y),
        maxY: Math.max(maxY, next.y),
      };
      if (
        bounds.maxX - bounds.minX > viewport.width * zoneSize ||
        bounds.maxY - bounds.minY > viewport.height * zoneSize
      )
        break;
      ({ minX, maxX, minY, maxY } = bounds);
      last++;
    }
    result.push({
      start: initial.time,
      end: observations[last]!.time,
      first,
      last,
      segmentId: initial.segmentId,
      preferred: activityCenter(observations, first, last),
    });
    first = last + 1;
  }
  return result;
}
