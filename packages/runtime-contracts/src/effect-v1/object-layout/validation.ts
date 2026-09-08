import {
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  requirePositiveNumber,
  validateLocaleText,
  type EffectV1DiagnosticReporter,
} from '../validation/shared.js';
import { EFFECT_V1_OBJECT_MAX_SIZE, EFFECT_V1_HANDLE_MAX_COORDINATE } from './geometry.js';

export function validateEffectV1ObjectLayout(
  value: unknown,
  kind: unknown,
  controls: unknown,
  report: EffectV1DiagnosticReporter
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    report.error('OBJECT_LAYOUT_TYPE', '$.objectLayout', 'Expected an object layout.');
    return;
  }
  if (kind !== 'standalone') {
    report.error(
      'OBJECT_LAYOUT_KIND',
      '$.objectLayout',
      'Only standalone effects can declare an object layout.'
    );
  }
  rejectUnknownKeys(
    value,
    new Set(['width', 'height', 'resize', 'handles']),
    '$.objectLayout',
    report
  );
  for (const key of ['width', 'height']) {
    requirePositiveNumber(value[key], `$.objectLayout.${key}`, report);
    const size = value[key];
    if (typeof size === 'number' && (size < 1 || size > EFFECT_V1_OBJECT_MAX_SIZE)) {
      report.error(
        'OBJECT_LAYOUT_SIZE',
        `$.objectLayout.${key}`,
        'Expected a dimension between 1 and 16384.'
      );
    }
  }
  if (value['resize'] !== 'scale' && value['resize'] !== 'reflow') {
    report.error('OBJECT_LAYOUT_RESIZE', '$.objectLayout.resize', 'Expected scale or reflow.');
  }
  validateHandles(value['handles'], value['resize'], controls, report);
}

function validateHandles(
  handles: unknown,
  resize: unknown,
  controls: unknown,
  report: EffectV1DiagnosticReporter
): void {
  if (handles === undefined) return;
  if (!Array.isArray(handles) || handles.length < 1 || handles.length > 8) {
    report.error(
      'OBJECT_HANDLES',
      '$.objectLayout.handles',
      'Expected one to eight object handles.'
    );
    return;
  }
  if (resize !== 'scale') {
    report.error(
      'OBJECT_HANDLE_RESIZE',
      '$.objectLayout.resize',
      'External handles require scale layout.'
    );
  }
  const ids = new Set<string>();
  handles.forEach((handle: unknown, index) => {
    const path = `$.objectLayout.handles[${index}]`;
    if (!isRecord(handle)) {
      report.error('OBJECT_HANDLE_TYPE', path, 'Expected a handle object.');
      return;
    }
    rejectUnknownKeys(
      handle,
      new Set(['id', 'label', 'xControl', 'yControl', 'padding']),
      path,
      report
    );
    const id = handle['id'];
    if (requireIdentifier(id, `${path}.id`, report)) {
      if (ids.has(id))
        report.error('OBJECT_HANDLE_DUPLICATE', `${path}.id`, 'Handle identifiers must be unique.');
      ids.add(id);
    }
    validateLocaleText(handle['label'], `${path}.label`, true, report);
    const padding = handle['padding'];
    if (typeof padding !== 'number' || !Number.isFinite(padding) || padding < 0 || padding > 256) {
      report.error(
        'OBJECT_HANDLE_PADDING',
        `${path}.padding`,
        'Expected padding between 0 and 256.'
      );
    }
    for (const key of ['xControl', 'yControl']) {
      requireIdentifier(handle[key], `${path}.${key}`, report);
      const control: unknown = Array.isArray(controls)
        ? controls.find((c: unknown) => isRecord(c) && c['id'] === handle[key])
        : undefined;
      if (!isBoundedAxis(control)) {
        report.error(
          'OBJECT_HANDLE_CONTROL',
          `${path}.${key}`,
          'Expected a bounded numeric coordinate control.'
        );
      }
    }
    if (handle['xControl'] === handle['yControl']) {
      report.error('OBJECT_HANDLE_AXES', path, 'Each axis needs a separate control.');
    }
  });
}

function isBoundedAxis(control: unknown): boolean {
  if (!isRecord(control) || control['kind'] !== 'number') return false;
  const min = control['min'];
  const max = control['max'];
  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= -EFFECT_V1_HANDLE_MAX_COORDINATE &&
    max <= EFFECT_V1_HANDLE_MAX_COORDINATE
  );
}
