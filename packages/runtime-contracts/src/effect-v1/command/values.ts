// policyStateIds: [] - value-shape key sets are immutable contract validation policy.
import {
  type EffectV1DiagnosticReporter,
  isRecord,
  rejectUnknownKeys,
} from '../validation/shared.js';

const FILTER_KEYS = new Set(['blur', 'brightness', 'saturate']);
const SHADOW_KEYS = new Set(['blur', 'color', 'x', 'y']);
const LINEAR_GRADIENT_KEYS = new Set(['kind', 'stops', 'x0', 'x1', 'y0', 'y1']);
const RADIAL_GRADIENT_KEYS = new Set([...LINEAR_GRADIENT_KEYS, 'r0', 'r1']);
const GRADIENT_STOP_KEYS = new Set(['color', 'offset']);

export function validateNumericExpression(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (isRecord(value) && typeof value['op'] === 'string') return;
  report.error('COMMAND_NUMBER', path, 'Expected a finite number or a declared expression.');
}

export function validateFilter(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('COMMAND_OBJECT_TYPE', path, 'Expected an object.');
    return;
  }
  rejectUnknownKeys(value, FILTER_KEYS, path, report);
  for (const [key, child] of Object.entries(value)) {
    validateNumericExpression(child, `${path}.${key}`, report);
  }
}

export function validateShadow(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('COMMAND_OBJECT_TYPE', path, 'Expected a shadow object.');
    return;
  }
  rejectUnknownKeys(value, SHADOW_KEYS, path, report);
  for (const field of ['blur', 'x', 'y']) {
    if (value[field] !== undefined)
      validateNumericExpression(value[field], `${path}.${field}`, report);
  }
  const color = value['color'];
  if (
    color !== undefined &&
    typeof color !== 'string' &&
    !(isRecord(color) && typeof color['op'] === 'string')
  ) {
    report.error('SHADOW_COLOR', `${path}.color`, 'Expected a color string or expression.');
  }
}

export function validatePaint(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (typeof value === 'string' || (isRecord(value) && typeof value['op'] === 'string')) return;
  if (!isRecord(value)) {
    report.error('PAINT_TYPE', path, 'Expected a color, color expression, or gradient object.');
    return;
  }
  if (value['kind'] !== 'linearGradient' && value['kind'] !== 'radialGradient') {
    report.error('PAINT_KIND', `${path}.kind`, 'Expected linearGradient or radialGradient.');
    return;
  }
  validateGradient(value, path, report);
}

function validateGradient(
  value: Record<string, unknown>,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  const radial = value['kind'] === 'radialGradient';
  rejectUnknownKeys(value, radial ? RADIAL_GRADIENT_KEYS : LINEAR_GRADIENT_KEYS, path, report);
  const fields = radial ? ['x0', 'y0', 'r0', 'x1', 'y1', 'r1'] : ['x0', 'y0', 'x1', 'y1'];
  for (const field of fields) validateGradientField(value, field, path, report);
  if (!Array.isArray(value['stops']) || value['stops'].length < 2) {
    report.error('GRADIENT_STOPS', `${path}.stops`, 'Gradient requires at least two color stops.');
    return;
  }
  value['stops'].forEach((stop, index) =>
    validateGradientStop(stop, `${path}.stops[${index}]`, report)
  );
}

function validateGradientField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (value[field] === undefined) {
    report.error(
      'GRADIENT_FIELD_REQUIRED',
      `${path}.${field}`,
      `Gradient requires field "${field}".`
    );
  } else validateNumericExpression(value[field], `${path}.${field}`, report);
}

function validateGradientStop(
  stop: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(stop)) {
    report.error('GRADIENT_STOP_TYPE', path, 'Expected { offset, color }.');
    return;
  }
  rejectUnknownKeys(stop, GRADIENT_STOP_KEYS, path, report);
  if (stop['color'] === undefined)
    report.error(
      'GRADIENT_FIELD_REQUIRED',
      `${path}.color`,
      'Gradient stop requires field "color".'
    );
  else validatePaint(stop['color'], `${path}.color`, report);
  if (stop['offset'] === undefined)
    report.error(
      'GRADIENT_FIELD_REQUIRED',
      `${path}.offset`,
      'Gradient stop requires field "offset".'
    );
  else {
    validateNumericExpression(stop['offset'], `${path}.offset`, report);
    if (typeof stop['offset'] === 'number' && (stop['offset'] < 0 || stop['offset'] > 1)) {
      report.error(
        'GRADIENT_OFFSET_RANGE',
        `${path}.offset`,
        'Gradient offset must be from 0 to 1.'
      );
    }
  }
}
