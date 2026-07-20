// policyStateIds: [] - expression operations and fields are immutable contract validation policy.
import { EFFECT_V1_EXPRESSION_OPS } from '../model/types.js';
import { validateDefinitionCycles } from './cycles.js';
import { isSafeEffectV1ReadPath } from './read-path.js';
import { EXPRESSION_SHAPES } from './shapes.js';
import { validateReadReference } from './references.js';
import type { EffectV1ReadReferences } from '../graph/model.js';
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
} from '../validation/shared.js';

const MAX_EXPRESSION_DEPTH = 32;
const EXPRESSION_KEYS = new Set(['args', 'fallback', 'op', 'path', 'value', 'values']);

export const EXPRESSION_OPS = new Set<string>(EFFECT_V1_EXPRESSION_OPS);

export function validateEffectV1Definitions(
  definitions: Record<string, unknown>,
  references: EffectV1ReadReferences,
  report: EffectV1DiagnosticReporter
): void {
  for (const [name, expression] of Object.entries(definitions)) {
    if (!/^[a-z][a-zA-Z0-9._-]{0,63}$/.test(name)) {
      report.error(
        'DEFINITION_ID',
        `$.program.definitions.${name}`,
        'Expected a safe definition id.'
      );
    }
    validateEffectV1Expression(expression, `$.program.definitions.${name}`, 0, report, references);
  }
  validateDefinitionCycles(definitions, report);
}

export function validateCommandExpressions(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences
): void {
  for (const [key, value] of Object.entries(command)) {
    if (['commands', 'items', 'op'].includes(key)) continue;
    walkExpressionCandidates(value, `${path}.${key}`, report, references);
  }
}

function walkExpressionCandidates(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences
): void {
  if (isRecord(value) && typeof value['op'] === 'string') {
    validateEffectV1Expression(value, path, 0, report, references);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkExpressionCandidates(item, `${path}[${index}]`, report, references)
    );
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) =>
      walkExpressionCandidates(child, `${path}.${key}`, report, references)
    );
  }
}

export function validateEffectV1Expression(
  value: unknown,
  path: string,
  depth: number,
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences
): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    report.error('EXPRESSION_DEPTH', path, `Expression nesting exceeds ${MAX_EXPRESSION_DEPTH}.`);
    return;
  }
  if (value == null || ['boolean', 'number', 'string'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      report.error('EXPRESSION_NUMBER', path, 'Expression numbers must be finite.');
    }
    return;
  }
  if (!isRecord(value) || !EXPRESSION_OPS.has(String(value['op']))) {
    report.error(
      'EXPRESSION_OP',
      `${path}.op`,
      `Unknown expression operation "${isRecord(value) ? String(value['op']) : String(value)}".`
    );
    return;
  }
  rejectUnknownKeys(value, EXPRESSION_KEYS, path, report);
  validateExpressionShape(value, path, report);
  if (value['op'] === 'read' && !isSafeEffectV1ReadPath(value['path'])) {
    report.error(
      'READ_PATH',
      `${path}.path`,
      'Read path is not in the declared frame scope.',
      'Read time, progress, width, height, controls.*, tracks.*, layers.*, vars.*, item.*, defs.*, or input.*.'
    );
  } else if (value['op'] === 'read') {
    validateReadReference(value['path'], `${path}.path`, references, report);
  }
  validateExpressionChildren(value, path, depth, report, references);
}

function validateExpressionChildren(
  value: EffectV1Record,
  path: string,
  depth: number,
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences
): void {
  for (const key of ['args', 'values'] as const) {
    const children = value[key];
    if (children !== undefined) {
      if (!Array.isArray(children)) {
        report.error('EXPRESSION_ARGS', `${path}.${key}`, 'Expected an expression array.');
      } else {
        children.forEach((child, index) =>
          validateEffectV1Expression(
            child,
            `${path}.${key}[${index}]`,
            depth + 1,
            report,
            references
          )
        );
      }
    }
  }
  for (const key of ['fallback', 'value'] as const) {
    if (value[key] !== undefined) {
      validateEffectV1Expression(value[key], `${path}.${key}`, depth + 1, report, references);
    }
  }
}

function validateExpressionShape(
  value: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  const shape = EXPRESSION_SHAPES[String(value['op'])];
  if (!shape) return;
  if (shape.args) {
    if (!Array.isArray(value['args'])) {
      report.error(
        'EXPRESSION_ARGS_REQUIRED',
        `${path}.args`,
        `Operation "${value['op']}" requires an argument array.`
      );
      return;
    }
    const [minimum, maximum] = shape.args;
    if (value['args'].length < minimum || value['args'].length > maximum) {
      report.error(
        'EXPRESSION_ARITY',
        `${path}.args`,
        minimum === maximum
          ? `Operation "${value['op']}" requires exactly ${minimum} argument${minimum === 1 ? '' : 's'}.`
          : `Operation "${value['op']}" requires ${minimum} to ${maximum} arguments.`
      );
    }
    return;
  }
  for (const field of shape.fields ?? []) {
    if (value[field] === undefined) {
      report.error(
        'EXPRESSION_FIELD_REQUIRED',
        `${path}.${field}`,
        `Operation "${value['op']}" requires field "${field}".`
      );
    }
  }
  if (value['op'] === 'select' && value['values'] !== undefined) {
    if (!Array.isArray(value['values']) || value['values'].length !== 2) {
      report.error(
        'EXPRESSION_SELECT_VALUES',
        `${path}.values`,
        'Select requires exactly two result values.'
      );
    }
  }
}
