// policyStateIds: [] - scene, clip, and control fields are immutable validation policy.
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  validateLocaleText,
  validateRange,
} from './shared.js';

const SCENE_KEYS = new Set(['duration', 'enabled', 'id', 'label', 'locked', 'start', 'transition']);
const CLIP_KEYS = new Set([
  'duration',
  'enabled',
  'layerId',
  'locked',
  'offset',
  'sceneId',
  'start',
]);
const CONTROL_KEYS = new Set(['defaultValue', 'id', 'kind', 'label', 'max', 'min', 'step']);

export function validateEffectV1Scenes(
  value: unknown,
  duration: number,
  report: EffectV1DiagnosticReporter
): Map<string, EffectV1Record> {
  const scenes = new Map<string, EffectV1Record>();
  if (!Array.isArray(value) || value.length === 0) {
    report.error(
      'SCENES_REQUIRED',
      '$.scenes',
      'Expected at least one scene.',
      'Use one scene spanning the full duration for a single-scene effect.'
    );
    return scenes;
  }
  value.forEach((scene, index) => {
    const path = `$.scenes[${index}]`;
    if (!isRecord(scene)) {
      report.error('SCENE_TYPE', path, 'Expected a scene object.');
      return;
    }
    rejectUnknownKeys(scene, SCENE_KEYS, path, report);
    if (requireIdentifier(scene['id'], `${path}.id`, report)) {
      if (scenes.has(scene['id'])) {
        report.error('SCENE_ID_DUPLICATE', `${path}.id`, 'Duplicate scene id.');
      }
      scenes.set(scene['id'], scene);
    }
    validateRange(scene['start'], scene['duration'], duration, path, report);
    validateOptionalBoolean(scene['enabled'], `${path}.enabled`, report);
    validateOptionalBoolean(scene['locked'], `${path}.locked`, report);
  });
  return scenes;
}

export function validateEffectV1Clips(
  value: unknown,
  layers: Map<string, EffectV1Record>,
  scenes: Map<string, EffectV1Record>,
  duration: number,
  report: EffectV1DiagnosticReporter
): void {
  if (!Array.isArray(value)) {
    report.error('CLIPS_TYPE', '$.clips', 'Expected a clip array.');
    return;
  }
  const clippedLayers = new Set<string>();
  value.forEach((clip, index) =>
    validateClip(clip, index, layers, scenes, duration, clippedLayers, report)
  );
}

function validateClip(
  clip: unknown,
  index: number,
  layers: Map<string, EffectV1Record>,
  scenes: Map<string, EffectV1Record>,
  duration: number,
  clippedLayers: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  const path = `$.clips[${index}]`;
  if (!isRecord(clip)) {
    report.error('CLIP_TYPE', path, 'Expected a clip object.');
    return;
  }
  rejectUnknownKeys(clip, CLIP_KEYS, path, report);
  const layer = layers.get(String(clip['layerId']));
  if (!layer) {
    report.error(
      'CLIP_LAYER_UNKNOWN',
      `${path}.layerId`,
      `Unknown layer "${String(clip['layerId'])}".`
    );
  } else if (layer['type'] === 'group') {
    report.error('GROUP_CLIP_FORBIDDEN', `${path}.layerId`, 'Structural groups cannot own clips.');
  }
  if (clippedLayers.has(String(clip['layerId']))) {
    report.error(
      'CLIP_LAYER_DUPLICATE',
      `${path}.layerId`,
      'An EffectV1 layer owns at most one clip.'
    );
  }
  clippedLayers.add(String(clip['layerId']));
  if (clip['sceneId'] != null && !scenes.has(String(clip['sceneId']))) {
    report.error(
      'CLIP_SCENE_UNKNOWN',
      `${path}.sceneId`,
      `Unknown scene "${String(clip['sceneId'])}".`
    );
  }
  validateRange(clip['start'], clip['duration'], duration, path, report);
  validateOptionalBoolean(clip['enabled'], `${path}.enabled`, report);
  validateOptionalBoolean(clip['locked'], `${path}.locked`, report);
  if (
    clip['offset'] !== undefined &&
    (typeof clip['offset'] !== 'number' || !Number.isFinite(clip['offset']))
  ) {
    report.error('CLIP_OFFSET', `${path}.offset`, 'Expected a finite number.');
  }
}

export function validateEffectV1Controls(
  value: unknown,
  report: EffectV1DiagnosticReporter
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    report.error('CONTROLS_TYPE', '$.controls', 'Expected a control array.');
    return ids;
  }
  value.forEach((control, index) => {
    const path = `$.controls[${index}]`;
    if (!isRecord(control)) {
      report.error('CONTROL_TYPE', path, 'Expected a control object.');
      return;
    }
    rejectUnknownKeys(control, CONTROL_KEYS, path, report);
    if (requireIdentifier(control['id'], `${path}.id`, report)) {
      if (ids.has(control['id'])) {
        report.error('CONTROL_ID_DUPLICATE', `${path}.id`, 'Duplicate control id.');
      }
      ids.add(control['id']);
    }
    if (!['color', 'number', 'text'].includes(String(control['kind']))) {
      report.error('CONTROL_KIND', `${path}.kind`, 'Expected color, number, or text.');
    }
    if (control['label'] !== undefined) {
      validateLocaleText(control['label'], `${path}.label`, false, report);
    }
    validateControlValue(control, path, report);
  });
  return ids;
}

function validateControlValue(
  control: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (control['kind'] === 'number') {
    const minimum = typeof control['min'] === 'number' ? control['min'] : undefined;
    const maximum = typeof control['max'] === 'number' ? control['max'] : undefined;
    const step = typeof control['step'] === 'number' ? control['step'] : undefined;
    const defaultValue =
      typeof control['defaultValue'] === 'number' ? control['defaultValue'] : undefined;
    for (const key of ['defaultValue', 'max', 'min', 'step']) {
      if (
        (key === 'defaultValue' || control[key] !== undefined) &&
        (typeof control[key] !== 'number' || !Number.isFinite(control[key]))
      ) {
        report.error('CONTROL_NUMBER', `${path}.${key}`, 'Expected a finite number.');
      }
    }
    if (minimum !== undefined && maximum !== undefined && minimum >= maximum) {
      report.error(
        'CONTROL_RANGE',
        path,
        'Control min must be lower than max so the parameter can change.'
      );
    }
    if (step !== undefined && step <= 0) {
      report.error('CONTROL_STEP', `${path}.step`, 'Control step must be greater than zero.');
    }
    if (
      defaultValue !== undefined &&
      ((minimum !== undefined && defaultValue < minimum) ||
        (maximum !== undefined && defaultValue > maximum))
    ) {
      report.error(
        'CONTROL_DEFAULT_RANGE',
        `${path}.defaultValue`,
        'Control defaultValue must be inside its min/max range.'
      );
    }
  } else if (
    ['color', 'text'].includes(String(control['kind'])) &&
    typeof control['defaultValue'] !== 'string'
  ) {
    report.error('CONTROL_STRING', `${path}.defaultValue`, 'Expected a string default value.');
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
