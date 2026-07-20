import { Path } from 'fabric';

export interface FreehandPointRecord {
  x: number;
  y: number;
}

type PathCommand = ReadonlyArray<string | number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFreehandPointRecord(value: unknown): value is FreehandPointRecord {
  return (
    isRecord(value) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y'])
  );
}

function appendPoint(points: FreehandPointRecord[], point: FreehandPointRecord): void {
  const previous = points.at(-1);
  if (previous?.x === point.x && previous.y === point.y) {
    return;
  }

  points.push(point);
}

function appendCommandPoints(points: FreehandPointRecord[], command: PathCommand): void {
  for (let index = 1; index < command.length - 1; index += 2) {
    const x = command[index];
    const y = command[index + 1];
    if (typeof x !== 'number' || typeof y !== 'number') {
      continue;
    }

    appendPoint(points, { x, y });
  }
}

export function serializeFreehandPoints(points: readonly FreehandPointRecord[]): string {
  return JSON.stringify(points);
}

export function parseFreehandPointsJson(value: unknown): FreehandPointRecord[] | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const points = parsed
      .filter(isFreehandPointRecord)
      .map((point) => ({ x: point.x, y: point.y }));
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

export function recoverFreehandPointsFromPath(object: unknown): FreehandPointRecord[] | null {
  if (!(object instanceof Path)) {
    return null;
  }

  const points: FreehandPointRecord[] = [];
  object.path.forEach((command) => appendCommandPoints(points, command));
  return points.length > 0 ? points : null;
}
