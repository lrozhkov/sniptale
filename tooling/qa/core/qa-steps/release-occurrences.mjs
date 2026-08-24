import { FULL_VIOLATION_STEP_TOOLS, RELEASE_DIRECT_STEPS } from './definitions.data.mjs';
import { createQaStepOccurrence } from './policy/index.mjs';

function createDirectOccurrence([id, label, tool, execution, source, runsIn]) {
  return createQaStepOccurrence({
    id,
    label,
    tool,
    execution,
    source,
    runsIn,
    lane: 'release-direct',
    kind: 'tool',
  });
}

function createGuardrailOccurrence([label, tool]) {
  return createQaStepOccurrence({
    label,
    tool,
    lane: 'release-guardrail',
    kind: 'guardrail',
  });
}

export function createReleaseControlOccurrences() {
  return [
    ...RELEASE_DIRECT_STEPS.map(createDirectOccurrence),
    ...[...FULL_VIOLATION_STEP_TOOLS].map(createGuardrailOccurrence),
  ];
}
