import { validateNumericExpression } from './values.js';
import {
  type EffectV1DiagnosticReporter,
  isRecord,
  rejectUnknownKeys,
} from '../validation/shared.js';

const PATH_SEGMENT_FIELDS: Record<string, readonly string[]> = {
  arc: ['centerX', 'centerY', 'end', 'radius', 'start'],
  cubicTo: ['cp1x', 'cp1y', 'cp2x', 'cp2y', 'x', 'y'],
  ellipse: ['centerX', 'centerY', 'end', 'radiusX', 'radiusY', 'rotation', 'start'],
  lineTo: ['x', 'y'],
  moveTo: ['x', 'y'],
  quadraticTo: ['cpx', 'cpy', 'x', 'y'],
  rect: ['height', 'width', 'x', 'y'],
  roundRect: ['height', 'radius', 'width', 'x', 'y'],
};

export function validatePoints(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!Array.isArray(value)) {
    report.error('COMMAND_POINTS_TYPE', path, 'Expected a point array.');
    return;
  }
  if (value.length < 2)
    report.error('COMMAND_POINTS_SHORT', path, 'A path needs at least two points.');
  value.forEach((point, index) => validatePoint(point, `${path}[${index}]`, report));
}

function validatePoint(value: unknown, path: string, report: EffectV1DiagnosticReporter): void {
  if (!isRecord(value)) {
    report.error('COMMAND_POINT_TYPE', path, 'Expected { x, y }.');
    return;
  }
  rejectUnknownKeys(value, new Set(['x', 'y']), path, report);
  for (const coordinate of ['x', 'y']) {
    if (value[coordinate] === undefined)
      report.error(
        'COMMAND_FIELD_REQUIRED',
        `${path}.${coordinate}`,
        `Point requires field "${coordinate}".`
      );
    else validateNumericExpression(value[coordinate], `${path}.${coordinate}`, report);
  }
}

export function validatePathSegments(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!Array.isArray(value)) {
    report.error('COMMAND_PATH_SEGMENTS_TYPE', path, 'Expected a segment array.');
    return;
  }
  if (value.length === 0)
    report.error('COMMAND_PATH_SEGMENTS_EMPTY', path, 'A path needs at least one segment.');
  value.forEach((segment, index) => validatePathSegment(segment, `${path}[${index}]`, report));
}

function validatePathSegment(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('COMMAND_PATH_SEGMENT_TYPE', path, 'Expected a path segment object.');
    return;
  }
  const required = PATH_SEGMENT_FIELDS[String(value['kind'])];
  if (!required) {
    report.error(
      'COMMAND_PATH_SEGMENT_KIND',
      `${path}.kind`,
      `Unsupported path segment kind "${String(value['kind'])}".`
    );
    return;
  }
  rejectUnknownKeys(value, new Set(['counterclockwise', 'kind', ...required]), path, report);
  for (const field of required) validateSegmentField(value, field, path, report);
  if (value['counterclockwise'] !== undefined && typeof value['counterclockwise'] !== 'boolean') {
    report.error('COMMAND_BOOLEAN', `${path}.counterclockwise`, 'Expected a boolean.');
  }
}

function validateSegmentField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (value[field] === undefined)
    report.error(
      'COMMAND_FIELD_REQUIRED',
      `${path}.${field}`,
      `Path segment "${value['kind']}" requires field "${field}".`
    );
  else validateNumericExpression(value[field], `${path}.${field}`, report);
}
