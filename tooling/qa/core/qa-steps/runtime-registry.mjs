import {
  ADVISORY_STEPS,
  AUDIT_STEPS,
  BUILD_COMMIT_STEPS,
  BUILD_STEPS,
  CLOSEOUT_STEPS,
  E2E_STEPS,
  FOCUSED_DIRECT_STEPS,
  FOCUSED_TRIGGERED_RUNTIME_STEPS,
  FOCUSED_VIOLATION_STEP_TOOLS,
  FULL_VIOLATION_STEP_TOOLS,
  HARNESS_STEPS,
  RELEASE_DIRECT_STEPS,
  WRAPPER_LIFECYCLE_STEPS,
} from './definitions.data.mjs';
import { createQaStepOccurrence } from './policy/index.mjs';

function fromTuple(tuple, lane, kind = 'tool') {
  const [id, label, tool, execution, source, runsIn] = tuple;
  return createQaStepOccurrence({ id, label, tool, execution, source, runsIn, lane, kind });
}

function fromToolMap(toolMap, lane) {
  return [...toolMap].map(([label, tool]) =>
    createQaStepOccurrence({ label, tool, lane, kind: 'guardrail' })
  );
}

const occurrences = [
  ...RELEASE_DIRECT_STEPS.map((tuple) => fromTuple(tuple, 'release-direct')),
  ...fromToolMap(FULL_VIOLATION_STEP_TOOLS, 'release-guardrail'),
  ...FOCUSED_DIRECT_STEPS.map((tuple) => fromTuple(tuple, 'focused-direct')),
  ...FOCUSED_TRIGGERED_RUNTIME_STEPS.map((tuple) =>
    fromTuple(tuple, 'focused-triggered', 'guardrail')
  ),
  ...fromToolMap(FOCUSED_VIOLATION_STEP_TOOLS, 'focused-guardrail'),
  ...HARNESS_STEPS.map((tuple) => fromTuple(tuple, 'harness')),
  ...BUILD_STEPS.map((tuple) => fromTuple(tuple, 'build')),
  ...BUILD_COMMIT_STEPS.map((tuple) => fromTuple(tuple, 'build-commit')),
  ...CLOSEOUT_STEPS.map((tuple) => fromTuple(tuple, 'closeout')),
  ...WRAPPER_LIFECYCLE_STEPS.map((tuple) => fromTuple(tuple, 'wrapper-lifecycle')),
  ...E2E_STEPS.map((tuple) => fromTuple(tuple, 'e2e')),
  ...AUDIT_STEPS.map((tuple) => fromTuple(tuple, 'audit')),
  ...ADVISORY_STEPS.map((tuple) => fromTuple(tuple, 'advisory', 'advisory')),
];

export const OBSERVED_QA_RULES = Object.freeze(
  [...new Map(occurrences.map((occurrence) => [occurrence.label, occurrence])).values()].sort(
    (left, right) => left.label.localeCompare(right.label)
  )
);

export function findObservedQaRule(label) {
  return OBSERVED_QA_RULES.find((definition) => definition.label === label);
}

export function assertObservedQaRuleId(id) {
  if (!OBSERVED_QA_RULES.some((definition) => definition.id === id)) {
    throw new Error(`Unregistered QA lifecycle step emitted: ${id}`);
  }
}
