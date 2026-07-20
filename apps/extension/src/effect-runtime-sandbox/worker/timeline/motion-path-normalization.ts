import type {
  MotionPathPointKind,
  MotionPathTangent,
  TimelineMotionPath,
  TimelineMotionPathPoint,
} from './motion-path-types.js';

export function normalizeMotionPaths(value: unknown): TimelineMotionPath[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entryValue) => {
    if (!isRecord(entryValue) || !Array.isArray(entryValue['points'])) return [];
    const points = entryValue['points']
      .flatMap((point) => (isRecord(point) ? [normalizeMotionPathPoint(point)] : []))
      .filter((point) => point.xKeyframeId.length > 0 && point.yKeyframeId.length > 0);
    const layerId = String(entryValue['layerId'] ?? '');
    return layerId && points.length > 0 ? [{ layerId, points }] : [];
  });
}

function normalizeMotionPathPoint(point: Record<string, unknown>): TimelineMotionPathPoint {
  return {
    inTangent: normalizeMotionPathTangent(point['inTangent']),
    kind: isMotionPathPointKind(point['kind']) ? point['kind'] : 'linear',
    outTangent: normalizeMotionPathTangent(point['outTangent']),
    xKeyframeId: String(point['xKeyframeId'] ?? ''),
    yKeyframeId: String(point['yKeyframeId'] ?? ''),
  };
}

function normalizeMotionPathTangent(value: unknown): MotionPathTangent {
  if (!isRecord(value)) return { x: 0, y: 0 };
  return { x: finiteOrZero(value['x']), y: finiteOrZero(value['y']) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMotionPathPointKind(value: unknown): value is MotionPathPointKind {
  return value === 'corner' || value === 'linear' || value === 'smooth';
}

function finiteOrZero(value: unknown): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : 0;
}
