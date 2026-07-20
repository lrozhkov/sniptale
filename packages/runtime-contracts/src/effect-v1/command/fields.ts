// policyStateIds: [] - command field tables are immutable contract validation policy.
import { validateNumericExpression } from './values.js';
import type { EffectV1DiagnosticReporter, EffectV1Record } from '../validation/shared.js';

const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  clip: ['commands', 'height', 'width', 'x', 'y'],
  compositePass: ['passId'],
  fillRect: ['fill', 'height', 'width', 'x', 'y'],
  forEach: ['commands', 'items'],
  forGrid: ['columns', 'commands', 'rows'],
  forRange: ['commands', 'count'],
  group: ['commands'],
  image: ['height', 'width', 'x', 'y'],
  let: ['bindings', 'commands'],
  path: [],
  polyline: ['points', 'stroke'],
  renderPass: ['commands', 'id'],
  sampledPath: ['from', 'samples', 'stroke', 'to', 'x', 'y'],
  shape: ['height', 'shape', 'width', 'x', 'y'],
  stableOrderBy: ['commands', 'items', 'key'],
  svgParts: ['assetId', 'height', 'width', 'x', 'y'],
  text: ['text', 'x', 'y'],
  when: ['commands', 'condition'],
};

const NUMERIC_FIELDS = new Set([
  'alpha',
  'fontSize',
  'from',
  'height',
  'lineWidth',
  'maxWidth',
  'progress',
  'radius',
  'rotation',
  'scaleX',
  'scaleY',
  'to',
  'width',
  'x',
  'y',
]);
const ENUM_FIELDS: Record<string, ReadonlySet<string>> = {
  align: new Set(['center', 'end', 'left', 'right', 'start']),
  baseline: new Set(['alphabetic', 'bottom', 'hanging', 'ideographic', 'middle', 'top']),
  blend: new Set(['lighter', 'screen', 'source-over']),
  direction: new Set(['asc', 'desc']),
  fit: new Set(['contain', 'cover', 'fill']),
  fontStyle: new Set(['italic', 'normal', 'oblique']),
  lineCap: new Set(['butt', 'round', 'square']),
  lineJoin: new Set(['bevel', 'miter', 'round']),
  shape: new Set(['circle', 'diamond', 'ellipse', 'rect', 'roundRect']),
};

export function validateCommandFields(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  for (const field of REQUIRED_FIELDS[String(command['op'])] ?? []) {
    if (command[field] === undefined) {
      report.error(
        'COMMAND_FIELD_REQUIRED',
        `${path}.${field}`,
        `Command "${command['op']}" requires field "${field}".`
      );
    }
  }
  for (const field of NUMERIC_FIELDS) {
    if (command[field] !== undefined) {
      validateNumericExpression(command[field], `${path}.${field}`, report);
    }
  }
  for (const [field, values] of Object.entries(ENUM_FIELDS)) {
    if (command[field] !== undefined && !values.has(String(command[field]))) {
      report.error(
        'COMMAND_ENUM',
        `${path}.${field}`,
        `Unsupported ${field} value "${String(command[field])}".`,
        `Use one of: ${[...values].join(', ')}.`
      );
    }
  }
}

export function validateCommandBounds(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (command['op'] === 'forRange')
    validateStaticLoopField(command['count'], `${path}.count`, report);
  if (command['op'] === 'forGrid') {
    validateStaticLoopField(command['columns'], `${path}.columns`, report);
    validateStaticLoopField(command['rows'], `${path}.rows`, report);
  }
  if (command['op'] !== 'sampledPath') return;
  const samples = Number(command['samples']);
  if (!Number.isSafeInteger(samples) || samples < 2 || samples > 256) {
    report.error(
      'SAMPLED_PATH_BOUND',
      `${path}.samples`,
      'Sampled path requires a static sample count from 2 to 256.'
    );
  }
  if (
    command['sampleVar'] !== undefined &&
    !/^[a-z][a-zA-Z0-9_-]{0,31}$/.test(String(command['sampleVar']))
  ) {
    report.error(
      'SAMPLED_PATH_VARIABLE',
      `${path}.sampleVar`,
      'Expected a safe sample variable name.'
    );
  }
}

function validateStaticLoopField(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 512) {
    report.error(
      'LOOP_BOUND',
      path,
      'Expected a static integer from 1 to 512.',
      'Use a bounded literal; runtime-sized loops are forbidden.'
    );
  }
}
