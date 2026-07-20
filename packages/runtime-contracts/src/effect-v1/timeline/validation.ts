// policyStateIds: [] - timeline field sets are immutable contract validation policy.
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  validateRange,
} from '../validation/shared.js';
import { validateEffectV1MotionPaths } from './motion-path.js';

const PHASE_KEYS = new Set(['duration', 'enabled', 'id', 'label', 'locked', 'sceneId', 'start']);
const TRACK_KEYS = new Set([
  'enabled',
  'id',
  'keyframes',
  'label',
  'layerId',
  'phaseId',
  'property',
  'sceneId',
  'target',
]);
const KEYFRAME_KEYS = new Set([
  'easing',
  'enabled',
  'handles',
  'id',
  'phaseId',
  'sceneId',
  'time',
  'value',
]);
const HANDLE_KEYS = new Set(['x1', 'x2', 'y1', 'y2']);

export function validateEffectV1Timeline(
  value: unknown,
  layers: Map<string, EffectV1Record>,
  scenes: Map<string, EffectV1Record>,
  duration: number,
  report: EffectV1DiagnosticReporter
): Set<string> {
  if (!isRecord(value)) {
    report.error('TIMELINE_TYPE', '$.timeline', 'Expected a timeline object.');
    return new Set();
  }
  rejectUnknownKeys(value, new Set(['motionPaths', 'phases', 'tracks']), '$.timeline', report);
  const phaseIds = validatePhases(value['phases'], scenes, duration, report);
  const trackIds = validateTracks(value['tracks'], layers, scenes, phaseIds, duration, report);
  validateEffectV1MotionPaths(value['motionPaths'], value['tracks'], layers, report);
  return trackIds;
}

function validatePhases(
  value: unknown,
  scenes: Map<string, EffectV1Record>,
  duration: number,
  report: EffectV1DiagnosticReporter
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    report.error('PHASES_TYPE', '$.timeline.phases', 'Expected a phase array.');
    return ids;
  }
  value.forEach((phase, index) => {
    const path = `$.timeline.phases[${index}]`;
    if (!isRecord(phase)) {
      report.error('PHASE_TYPE', path, 'Expected a phase object.');
      return;
    }
    rejectUnknownKeys(phase, PHASE_KEYS, path, report);
    if (requireIdentifier(phase['id'], `${path}.id`, report)) {
      if (ids.has(phase['id'])) {
        report.error('PHASE_ID_DUPLICATE', `${path}.id`, 'Duplicate phase id.');
      }
      ids.add(phase['id']);
    }
    if (phase['sceneId'] != null && !scenes.has(String(phase['sceneId']))) {
      report.error('PHASE_SCENE_UNKNOWN', `${path}.sceneId`, 'Unknown scene.');
    }
    validateRange(phase['start'], phase['duration'], duration, path, report);
    validateOptionalBoolean(phase['enabled'], `${path}.enabled`, report);
    validateOptionalBoolean(phase['locked'], `${path}.locked`, report);
  });
  return ids;
}

function validateTracks(
  value: unknown,
  layers: Map<string, EffectV1Record>,
  scenes: Map<string, EffectV1Record>,
  phaseIds: Set<string>,
  duration: number,
  report: EffectV1DiagnosticReporter
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    report.error('TRACKS_TYPE', '$.timeline.tracks', 'Expected a track array.');
    return ids;
  }
  value.forEach((track, index) => {
    const path = `$.timeline.tracks[${index}]`;
    if (!isRecord(track)) {
      report.error('TRACK_TYPE', path, 'Expected a track object.');
      return;
    }
    rejectUnknownKeys(track, TRACK_KEYS, path, report);
    if (requireIdentifier(track['id'], `${path}.id`, report)) {
      if (ids.has(track['id'])) {
        report.error('TRACK_ID_DUPLICATE', `${path}.id`, 'Duplicate track id.');
      }
      ids.add(track['id']);
    }
    const layerId = track['layerId'] ?? track['target'];
    if (layerId !== undefined) {
      const layer = layers.get(String(layerId));
      if (!layer) {
        report.error('TRACK_LAYER_UNKNOWN', `${path}.target`, 'Unknown layer target.');
      } else if (layer['type'] === 'group') {
        report.error(
          'GROUP_TRACK_FORBIDDEN',
          `${path}.target`,
          'Structural groups cannot own animation tracks.'
        );
      }
    }
    if (track['sceneId'] != null && !scenes.has(String(track['sceneId']))) {
      report.error('TRACK_SCENE_UNKNOWN', `${path}.sceneId`, 'Unknown scene.');
    }
    if (track['phaseId'] != null && !phaseIds.has(String(track['phaseId']))) {
      report.error('TRACK_PHASE_UNKNOWN', `${path}.phaseId`, 'Unknown phase.');
    }
    validateKeyframes(track['keyframes'], path, scenes, phaseIds, duration, report);
    validateOptionalBoolean(track['enabled'], `${path}.enabled`, report);
  });
  return ids;
}

function validateKeyframes(
  value: unknown,
  trackPath: string,
  scenes: Map<string, EffectV1Record>,
  phaseIds: Set<string>,
  duration: number,
  report: EffectV1DiagnosticReporter
): void {
  if (!Array.isArray(value)) {
    report.error('KEYFRAMES_TYPE', `${trackPath}.keyframes`, 'Expected keyframes.');
    return;
  }
  let previousTime = -Infinity;
  value.forEach((keyframe, index) => {
    const path = `${trackPath}.keyframes[${index}]`;
    if (!isRecord(keyframe)) {
      report.error('KEYFRAME_TYPE', path, 'Expected a keyframe object.');
      return;
    }
    rejectUnknownKeys(keyframe, KEYFRAME_KEYS, path, report);
    requireIdentifier(keyframe['id'], `${path}.id`, report);
    const time = Number(keyframe['time']);
    if (!Number.isFinite(time) || time < 0 || time > duration) {
      report.error(
        'KEYFRAME_TIME',
        `${path}.time`,
        'Keyframe time must be inside the effect duration.'
      );
    }
    if (time < previousTime) {
      report.error(
        'KEYFRAME_ORDER',
        `${path}.time`,
        'Keyframes must be sorted by ascending time.',
        'Sort keyframes; EffectV1 never silently reorders author data.'
      );
    }
    previousTime = time;
    if (keyframe['sceneId'] != null && !scenes.has(String(keyframe['sceneId']))) {
      report.error('KEYFRAME_SCENE_UNKNOWN', `${path}.sceneId`, 'Unknown scene.');
    }
    if (keyframe['phaseId'] != null && !phaseIds.has(String(keyframe['phaseId']))) {
      report.error('KEYFRAME_PHASE_UNKNOWN', `${path}.phaseId`, 'Unknown phase.');
    }
    validateOptionalBoolean(keyframe['enabled'], `${path}.enabled`, report);
    validateHandles(keyframe['handles'], `${path}.handles`, report);
  });
}

function validateHandles(value: unknown, path: string, report: EffectV1DiagnosticReporter): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    report.error('KEYFRAME_HANDLES', path, 'Expected a bezier handle object.');
    return;
  }
  rejectUnknownKeys(value, HANDLE_KEYS, path, report);
  for (const key of HANDLE_KEYS) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      report.error('KEYFRAME_HANDLE_NUMBER', `${path}.${key}`, 'Expected a finite number.');
    }
  }
}

function validateOptionalBoolean(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (value !== undefined && typeof value !== 'boolean') {
    report.error('BOOLEAN', path, 'Expected a boolean.');
  }
}
