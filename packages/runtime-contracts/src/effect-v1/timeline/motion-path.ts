// policyStateIds: [] - motion-path field sets are immutable contract validation policy.
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
} from '../validation/shared.js';

const MOTION_PATH_KEYS = new Set(['layerId', 'points']);
const MOTION_POINT_KEYS = new Set([
  'inTangent',
  'kind',
  'outTangent',
  'xKeyframeId',
  'yKeyframeId',
]);
const TANGENT_KEYS = new Set(['x', 'y']);

export function validateEffectV1MotionPaths(
  value: unknown,
  tracks: unknown,
  layers: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    report.error('MOTION_PATHS_TYPE', '$.timeline.motionPaths', 'Expected a motion path array.');
    return;
  }
  const keyframeIds = collectKeyframeIds(tracks);
  value.forEach((motionPath, index) => {
    const path = `$.timeline.motionPaths[${index}]`;
    if (!isRecord(motionPath)) {
      report.error('MOTION_PATH_TYPE', path, 'Expected a motion path object.');
      return;
    }
    rejectUnknownKeys(motionPath, MOTION_PATH_KEYS, path, report);
    if (!layers.has(String(motionPath['layerId']))) {
      report.error('MOTION_PATH_LAYER_UNKNOWN', `${path}.layerId`, 'Unknown motion path layer.');
    }
    if (!Array.isArray(motionPath['points'])) {
      report.error('MOTION_PATH_POINTS', `${path}.points`, 'Expected a motion path point array.');
      return;
    }
    motionPath['points'].forEach((point: unknown, pointIndex: number) =>
      validateMotionPoint(point, `${path}.points[${pointIndex}]`, keyframeIds, report)
    );
  });
}

function validateMotionPoint(
  value: unknown,
  path: string,
  keyframeIds: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('MOTION_POINT_TYPE', path, 'Expected a motion path point.');
    return;
  }
  rejectUnknownKeys(value, MOTION_POINT_KEYS, path, report);
  for (const key of ['xKeyframeId', 'yKeyframeId']) {
    if (typeof value[key] !== 'string' || !keyframeIds.has(value[key])) {
      report.error(
        'MOTION_POINT_KEYFRAME_UNKNOWN',
        `${path}.${key}`,
        'Expected an existing keyframe id.'
      );
    }
  }
  if (
    value['kind'] !== undefined &&
    !['corner', 'linear', 'smooth'].includes(String(value['kind']))
  ) {
    report.error('MOTION_POINT_KIND', `${path}.kind`, 'Expected corner, linear, or smooth.');
  }
  validateTangent(value['inTangent'], `${path}.inTangent`, report);
  validateTangent(value['outTangent'], `${path}.outTangent`, report);
}

function validateTangent(value: unknown, path: string, report: EffectV1DiagnosticReporter): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    report.error('MOTION_TANGENT_TYPE', path, 'Expected a tangent point.');
    return;
  }
  rejectUnknownKeys(value, TANGENT_KEYS, path, report);
  for (const key of TANGENT_KEYS) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      report.error('MOTION_TANGENT_NUMBER', `${path}.${key}`, 'Expected a finite number.');
    }
  }
}

function collectKeyframeIds(tracks: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(tracks)) return ids;
  for (const track of tracks) {
    if (!isRecord(track) || !Array.isArray(track['keyframes'])) continue;
    for (const keyframe of track['keyframes']) {
      if (isRecord(keyframe) && typeof keyframe['id'] === 'string') {
        ids.add(keyframe['id']);
      }
    }
  }
  return ids;
}
