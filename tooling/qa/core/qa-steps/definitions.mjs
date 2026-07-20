import { VERIFY_ALL_VIOLATION_STEPS } from '../verify-all.violation-steps.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS } from '../verify-focused.code-steps.mjs';
import { FOCUSED_TRIGGERED_STEP_DEFINITIONS } from '../verify-focused-triggered.helpers.mjs';
import {
  AUDIT_STEPS,
  ADVISORY_STEPS,
  BUILD_COMMIT_STEPS,
  BUILD_STEPS,
  CLOSEOUT_STEPS,
  E2E_STEPS,
  FOCUSED_DIRECT_STEPS,
  FOCUSED_VIOLATION_STEP_TOOLS,
  FULL_VIOLATION_STEP_TOOLS,
  HARNESS_STEPS,
  RELEASE_DIRECT_STEPS,
  WRAPPER_LIFECYCLE_STEPS,
} from './definitions.data.mjs';
import { REPO_AUDIT_REPORT_DEFINITIONS } from '../../evidence/repo-audit-evidence/registry.data.mjs';
import { createQaStepOccurrence } from './policy/index.mjs';

export { FOCUSED_VIOLATION_STEP_TOOLS, FULL_VIOLATION_STEP_TOOLS } from './definitions.data.mjs';

const ALWAYS_FOCUSED_TRIGGERED_LABELS = new Set([
  'App-core owners',
  'OSS release surface',
  'Package boundaries',
  'Root scatter',
  'Root side effects',
  'Target-only paths',
]);
const MANUAL_LABEL_BY_TOOL = new Map([
  ['verify-privacy-feature-settings.mjs', 'Privacy feature settings'],
  ['verify-stats-counter-semantics.mjs', 'Stats counter semantics'],
]);

function createTupleOccurrences(tuples, lane, kind) {
  return tuples.map(([id, label, tool, execution, source, runsIn]) =>
    createQaStepOccurrence({ id, label, tool, source, lane, kind, execution, runsIn })
  );
}

function createViolationOccurrences(steps, tools, lane) {
  return steps.map(([label]) =>
    createQaStepOccurrence({ label, tool: tools.get(label), lane, kind: 'guardrail' })
  );
}

function createTriggeredOccurrences() {
  return FOCUSED_TRIGGERED_STEP_DEFINITIONS.map(({ label, tool }) =>
    createQaStepOccurrence({
      label,
      tool,
      lane: 'focused-triggered',
      kind: 'guardrail',
      execution: ALWAYS_FOCUSED_TRIGGERED_LABELS.has(label) ? 'always' : 'conditional',
    })
  );
}

function createManualOccurrences(canonicalOccurrences) {
  const canonicalByTool = new Map(
    canonicalOccurrences.map((occurrence) => [occurrence.tool, occurrence])
  );
  return REPO_AUDIT_REPORT_DEFINITIONS.map(({ tool }) => {
    const normalizedTool = tool.replace(/^audits\//u, '');
    const canonical = canonicalByTool.get(normalizedTool);
    return createQaStepOccurrence({
      ...(canonical ? { id: canonical.id.replace(/^qa\.rule\./u, '') } : {}),
      label: canonical?.label ?? MANUAL_LABEL_BY_TOOL.get(tool) ?? `Manual audit: ${tool}`,
      tool: normalizedTool,
      lane: 'manual',
      kind: 'manual',
    });
  });
}

const NON_MANUAL_STEP_OCCURRENCES = Object.freeze([
  ...createTupleOccurrences(RELEASE_DIRECT_STEPS, 'release-direct', 'tool'),
  ...createViolationOccurrences(
    VERIFY_ALL_VIOLATION_STEPS,
    FULL_VIOLATION_STEP_TOOLS,
    'release-guardrail'
  ),
  ...createTupleOccurrences(FOCUSED_DIRECT_STEPS, 'focused-direct', 'tool'),
  ...createViolationOccurrences(
    FOCUSED_CODE_VIOLATION_STEPS,
    FOCUSED_VIOLATION_STEP_TOOLS,
    'focused-guardrail'
  ),
  ...createTriggeredOccurrences(),
  ...createTupleOccurrences(HARNESS_STEPS, 'harness', 'tool'),
  ...createTupleOccurrences(BUILD_STEPS, 'build', 'tool'),
  ...createTupleOccurrences(BUILD_COMMIT_STEPS, 'build-commit', 'tool'),
  ...createTupleOccurrences(CLOSEOUT_STEPS, 'closeout', 'tool'),
  ...createTupleOccurrences(WRAPPER_LIFECYCLE_STEPS, 'wrapper-lifecycle', 'tool'),
  ...createTupleOccurrences(E2E_STEPS, 'e2e', 'tool'),
  ...createTupleOccurrences(AUDIT_STEPS, 'audit', 'tool'),
  ...createTupleOccurrences(ADVISORY_STEPS, 'advisory', 'advisory'),
]);

export const QA_STEP_OCCURRENCES = Object.freeze([
  ...NON_MANUAL_STEP_OCCURRENCES,
  ...createManualOccurrences(NON_MANUAL_STEP_OCCURRENCES),
]);

function mergeOccurrence(existing, occurrence) {
  if (!existing) {
    return {
      ...occurrence,
      lanes: [occurrence.lane],
      runsIn: [...occurrence.runsIn],
      requiredBy: [...occurrence.requiredBy],
      executionModes: [occurrence.execution],
      sources: [occurrence.source],
    };
  }
  if (existing.label !== occurrence.label || existing.tool !== occurrence.tool) {
    throw new Error(`QA step id collision for ${occurrence.id}`);
  }
  return {
    ...existing,
    lanes: [...new Set([...existing.lanes, occurrence.lane])],
    runsIn: [...new Set([...existing.runsIn, ...occurrence.runsIn])],
    requiredBy: [...new Set([...existing.requiredBy, ...occurrence.requiredBy])],
    executionModes: [...new Set([...existing.executionModes, occurrence.execution])],
    sources: [...new Set([...existing.sources, occurrence.source])],
  };
}

export function collectQaRuleDefinitions() {
  const merged = new Map();
  for (const occurrence of QA_STEP_OCCURRENCES) {
    merged.set(occurrence.id, mergeOccurrence(merged.get(occurrence.id), occurrence));
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function collectQaStepDefinitionsByLane() {
  const lanes = {};
  for (const occurrence of QA_STEP_OCCURRENCES) {
    const entries = lanes[occurrence.lane] ?? [];
    entries.push(occurrence);
    lanes[occurrence.lane] = entries;
  }
  return lanes;
}

export function collectRegisteredQaTools() {
  return new Set(QA_STEP_OCCURRENCES.map(({ tool }) => tool));
}

export function findQaStepDefinition({ id, label, lane } = {}) {
  return QA_STEP_OCCURRENCES.find(
    (occurrence) =>
      (id == null || occurrence.id === id) &&
      (label == null || occurrence.label === label) &&
      (lane == null || occurrence.lane === lane)
  );
}

export const QA_RULE_DEFINITIONS = Object.freeze(collectQaRuleDefinitions());
