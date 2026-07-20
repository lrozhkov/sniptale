import { createEffectV1Diagnostics, finishEffectV1Validation } from '../model/diagnostics.js';
import { resolveEffectV1InputContract } from '../model/inputs.js';
import { validateEffectV1Assets } from '../asset/validation.js';
import { validateEffectV1Layers } from '../layer/validation.js';
import { rejectEffectV1ExecutableFields, validateEffectV1Program } from './program.js';
import {
  validateEffectV1Clips,
  validateEffectV1Controls,
  validateEffectV1Scenes,
} from './scene.js';
import { validateEffectV1Timeline } from '../timeline/validation.js';
import { validateEffectV1Closures } from './closure.js';
import {
  EFFECT_V1_KINDS,
  EFFECT_V1_SCHEMA,
  type EffectV1Document,
  type EffectV1Kind,
  type EffectV1ValidationResult,
} from '../model/types.js';
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  requirePositiveNumber,
  requireString,
  validateLocaleText,
} from './shared.js';
import { EFFECT_V1_ROOT_KEYS } from './root-keys.js';

export function parseEffectV1Source(source: string): EffectV1ValidationResult {
  if (typeof source !== 'string' || source.trim() === '') {
    return finishEffectV1Validation([
      {
        code: 'INPUT_EMPTY',
        message: 'Effect document is empty.',
        path: '$',
        severity: 'error',
        suggestion: 'Provide one UTF-8 JSON object.',
      },
    ]);
  }
  try {
    return validateEffectV1Document(JSON.parse(source));
  } catch (error) {
    return finishEffectV1Validation([
      {
        code: 'JSON_INVALID',
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        path: '$',
        severity: 'error',
        suggestion:
          'Use strict JSON: double-quoted keys and strings, without comments or trailing commas.',
      },
    ]);
  }
}

export function validateEffectV1Document(input: unknown): EffectV1ValidationResult {
  return validateEffectV1DocumentInternal(input);
}

function validateEffectV1DocumentInternal(input: unknown): EffectV1ValidationResult {
  const report = createEffectV1Diagnostics();
  if (!isRecord(input)) {
    report.error('ROOT_TYPE', '$', 'Expected one JSON object.');
    return finishEffectV1Validation(report.diagnostics);
  }
  rejectUnknownKeys(input, EFFECT_V1_ROOT_KEYS, '$', report);
  rejectEffectV1ExecutableFields(input, '$', report);
  validateEffectV1Identity(input, report);

  const assets = validateEffectV1Assets(input['assets'], report);
  const layers = validateEffectV1Layers(input['layers'], assets, report);
  const scenes = validateEffectV1Scenes(input['scenes'], Number(input['duration']), report);
  validateEffectV1Clips(input['clips'], layers, scenes, Number(input['duration']), report);
  const controlIds = validateEffectV1Controls(input['controls'], report);
  const trackIds = validateEffectV1Timeline(
    input['timeline'],
    layers,
    scenes,
    Number(input['duration']),
    report
  );
  const runtimeInputs = isEffectV1Kind(input['kind'])
    ? new Set(resolveEffectV1InputContract(input['kind']).required)
    : new Set<string>();
  validateEffectV1Program(
    input['program'],
    assets,
    runtimeInputs,
    { controlIds, layerIds: new Set(layers.keys()), trackIds },
    report
  );
  validateEffectV1Closures(input, { assets, controls: controlIds, tracks: trackIds }, report);
  return finishEffectV1Validation(report.diagnostics, input as unknown as EffectV1Document);
}

function validateEffectV1Identity(input: EffectV1Record, report: EffectV1DiagnosticReporter): void {
  requireString(input['schemaVersion'], '$.schemaVersion', report);
  if (input['schemaVersion'] !== EFFECT_V1_SCHEMA) {
    report.error(
      'SCHEMA_UNSUPPORTED',
      '$.schemaVersion',
      `Expected ${EFFECT_V1_SCHEMA}.`,
      `Set schemaVersion to "${EFFECT_V1_SCHEMA}"; v3 executable files are not supported.`
    );
  }
  requireIdentifier(input['id'], '$.id', report);
  if (!isEffectV1Kind(input['kind'])) {
    report.error(
      'KIND_UNKNOWN',
      '$.kind',
      'Expected standalone, targetEffect, or transition.',
      'Choose the kind from the runtime media the effect consumes.'
    );
  }
  requirePositiveNumber(input['duration'], '$.duration', report);
  validateLocaleText(input['label'], '$.label', true, report);
  if (input['description'] !== undefined) {
    validateLocaleText(input['description'], '$.description', false, report);
  }
  if (input['presets'] !== undefined && !Array.isArray(input['presets'])) {
    report.error('PRESETS_TYPE', '$.presets', 'Expected a preset array.');
  }
}

function isEffectV1Kind(value: unknown): value is EffectV1Kind {
  return typeof value === 'string' && EFFECT_V1_KINDS.some((kind) => kind === value);
}
