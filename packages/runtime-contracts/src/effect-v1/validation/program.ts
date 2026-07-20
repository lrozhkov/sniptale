// policyStateIds: [] - program and forbidden-field sets are immutable validation policy.
import { validateEffectV1Graph } from '../graph/validation.js';
import type { EffectV1GraphReferences } from '../graph/model.js';
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
} from './shared.js';

const PROGRAM_KEYS = new Set(['commands', 'definitions', 'kind', 'version']);
const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  'code',
  'compiledJs',
  'engineVersion',
  'moduleId',
  'renderer',
  'source',
]);

export function validateEffectV1Program(
  value: unknown,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  references: EffectV1GraphReferences,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('PROGRAM_TYPE', '$.program', 'Expected a render program.');
    return;
  }
  rejectUnknownKeys(value, PROGRAM_KEYS, '$.program', report);
  if (value['kind'] !== 'graph') {
    report.error('PROGRAM_KIND', '$.program.kind', 'Expected program kind "graph".');
    return;
  }
  if (value['version'] !== 1) {
    report.error('PROGRAM_VERSION', '$.program.version', 'Expected graph version 1.');
  }
  validateEffectV1Graph(value, assets, runtimeInputs, references, report);
}

export function rejectEffectV1ExecutableFields(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      rejectEffectV1ExecutableFields(child, `${path}[${index}]`, report)
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EXECUTABLE_KEYS.has(key)) {
      report.error(
        'EXECUTABLE_FIELD_FORBIDDEN',
        `${path}.${key}`,
        `Executable or legacy field "${key}" is forbidden in EffectV1.`,
        'Describe behavior with program.kind=graph.'
      );
    }
    rejectEffectV1ExecutableFields(child, `${path}.${key}`, report);
  }
}
