import {
  ADVISORY_STEPS,
  AUDIT_STEPS,
  BUILD_COMMIT_STEPS,
  BUILD_STEPS,
  CI_COMPOSITION_STEPS,
  CLOSEOUT_STEPS,
  E2E_STEPS,
  FOCUSED_CODE_VIOLATION_LABELS,
  FOCUSED_DIRECT_STEPS,
  FOCUSED_TRIGGERED_CONTROLS,
  FOCUSED_VIOLATION_STEP_TOOLS,
  FULL_VIOLATION_STEP_TOOLS,
  HARNESS_STEPS,
  RELEASE_DIRECT_STEPS,
  STRUCTURAL_AUDIT_STEPS,
  WRAPPER_LIFECYCLE_STEPS,
} from './catalog.data.mjs';
import { REPO_AUDIT_REPORT_DEFINITIONS } from '../../evidence/repo-audit-evidence/registry.data.mjs';
import { createQaStepOccurrence } from './policy/index.mjs';
import {
  QA_CATEGORY_ORDER,
  resolveQaCategory,
  resolveQaEngineDecision,
  resolveQaResourceProfile,
  resolveQaScopeProfile,
  resolveQaSemanticClass,
} from './category-profiles.mjs';

const ALWAYS_FOCUSED_TRIGGERED_LABELS = new Set([
  'App-core owners',
  'OSS release surface',
  'Package boundaries',
  'Root scatter',
  'Root side effects',
  'Target-only paths',
]);
const SCHEDULER_LANE_BY_ID = new Map([
  ['qa.rule.app-core-owners', 'appOwners'],
  ['qa.rule.target-only-paths', 'targetPaths'],
  ['qa.rule.typecheck', 'typecheck'],
  ['qa.rule.unit-tests', 'tests'],
  ['qa.rule.test-coverage', 'tests'],
  ['qa.rule.oxlint', 'lint'],
  ['qa.rule.logging-policy', 'lint'],
  ['qa.rule.sonarjs', 'lint'],
  ['qa.rule.security', 'lint'],
  ['qa.rule.dead-exports', 'graph'],
]);

function resolveSchedulerLane(record, category) {
  return (
    SCHEDULER_LANE_BY_ID.get(record.id) ?? (category === 'dependency-graph' ? 'graph' : 'light')
  );
}

function resolveSchedulerDependencyProfile(lane) {
  if (lane === 'typecheck') return 'after-lint';
  if (['graph', 'light'].includes(lane)) return 'after-lint-and-typecheck';
  if (lane === 'tests') return 'after-lint-and-typecheck-unless-release';
  return 'independent';
}

function fromTuple(tuple, lane, kind = 'tool') {
  const [id, label, tool, execution, source, runsIn] = tuple;
  return createQaStepOccurrence({
    id,
    label,
    tool,
    execution,
    source,
    runsIn,
    lane,
    kind,
  });
}

function fromToolMap(toolMap, lane) {
  return [...toolMap].map(([label, tool]) =>
    createQaStepOccurrence({ label, tool, lane, kind: 'guardrail' })
  );
}

function createReleaseOccurrences() {
  return [
    ...RELEASE_DIRECT_STEPS.map((tuple) => fromTuple(tuple, 'release-direct')),
    ...fromToolMap(FULL_VIOLATION_STEP_TOOLS, 'release-guardrail'),
  ];
}

export function createManualOccurrences(
  canonicalOccurrences,
  definitions = REPO_AUDIT_REPORT_DEFINITIONS
) {
  const canonicalById = new Map();
  for (const occurrence of canonicalOccurrences) {
    const existing = canonicalById.get(occurrence.id);
    if (existing && (existing.label !== occurrence.label || existing.tool !== occurrence.tool)) {
      throw new Error(`Canonical QA control identity is ambiguous: ${occurrence.id}`);
    }
    canonicalById.set(occurrence.id, occurrence);
  }
  return definitions.map(({ catalogTool, controlId, tool }) => {
    if (typeof controlId !== 'string' || !/^qa\.rule\.[a-z0-9-]+$/u.test(controlId)) {
      throw new Error(`Manual QA report has no explicit control id: ${tool}`);
    }
    const canonical = canonicalById.get(controlId);
    if (!canonical) throw new Error(`Manual QA report references unknown control: ${controlId}`);
    const normalizedTool = catalogTool ?? tool.replace(/^audits\//u, '');
    if (canonical.tool !== normalizedTool) {
      throw new Error(
        `Manual QA report tool does not match ${controlId}: ${normalizedTool} != ${canonical.tool}`
      );
    }
    return createQaStepOccurrence({
      id: controlId.replace(/^qa\.rule\./u, ''),
      label: canonical.label,
      tool: normalizedTool,
      source: canonical.source,
      lane: 'manual',
      kind: 'manual',
    });
  });
}

const NON_MANUAL_OCCURRENCES = [
  ...createReleaseOccurrences(),
  ...FOCUSED_DIRECT_STEPS.map((tuple) => fromTuple(tuple, 'focused-direct')),
  ...FOCUSED_CODE_VIOLATION_LABELS.map((label) =>
    createQaStepOccurrence({
      label,
      tool: FOCUSED_VIOLATION_STEP_TOOLS.get(label),
      lane: 'focused-guardrail',
      kind: 'guardrail',
    })
  ),
  createQaStepOccurrence({
    label: 'Messaging',
    tool: FOCUSED_VIOLATION_STEP_TOOLS.get('Messaging'),
    lane: 'focused-guardrail',
    kind: 'guardrail',
  }),
  ...FOCUSED_TRIGGERED_CONTROLS.map(([label, tool]) =>
    createQaStepOccurrence({
      label,
      tool,
      lane: 'focused-triggered',
      kind: 'guardrail',
      execution: ALWAYS_FOCUSED_TRIGGERED_LABELS.has(label) ? 'always' : 'conditional',
    })
  ),
  ...HARNESS_STEPS.map((tuple) => fromTuple(tuple, 'harness')),
  ...BUILD_STEPS.map((tuple) => fromTuple(tuple, 'build')),
  ...BUILD_COMMIT_STEPS.map((tuple) => fromTuple(tuple, 'build-commit')),
  ...CLOSEOUT_STEPS.map((tuple) => fromTuple(tuple, 'closeout')),
  ...CI_COMPOSITION_STEPS.map((tuple) => fromTuple(tuple, 'ci-composition')),
  ...WRAPPER_LIFECYCLE_STEPS.map((tuple) => fromTuple(tuple, 'wrapper-lifecycle')),
  ...E2E_STEPS.map((tuple) => fromTuple(tuple, 'e2e')),
  ...AUDIT_STEPS.map((tuple) => fromTuple(tuple, 'audit')),
  ...ADVISORY_STEPS.map((tuple) => fromTuple(tuple, 'advisory', 'advisory')),
  ...STRUCTURAL_AUDIT_STEPS.map((tuple) => fromTuple(tuple, 'structural-audit', 'manual')),
];

export const QA_CONTROL_OCCURRENCES = Object.freeze([
  ...NON_MANUAL_OCCURRENCES,
  ...createManualOccurrences(NON_MANUAL_OCCURRENCES),
]);

function mergeOccurrence(existing, occurrence, displayOrder) {
  if (!existing) {
    return {
      ...occurrence,
      occurrences: [occurrence],
      lanes: [occurrence.lane],
      runsIn: [...occurrence.runsIn],
      requiredBy: [...occurrence.requiredBy],
      executionModes: [occurrence.execution],
      sources: [occurrence.source],
      displayOrder,
    };
  }
  if (existing.label !== occurrence.label || existing.tool !== occurrence.tool) {
    throw new Error(`QA step id collision for ${occurrence.id}`);
  }
  return {
    ...existing,
    occurrences: [...existing.occurrences, occurrence],
    lanes: [...new Set([...existing.lanes, occurrence.lane])],
    runsIn: [...new Set([...existing.runsIn, ...occurrence.runsIn])],
    requiredBy: [...new Set([...existing.requiredBy, ...occurrence.requiredBy])],
    executionModes: [...new Set([...existing.executionModes, occurrence.execution])],
    sources: [...new Set([...existing.sources, occurrence.source])],
  };
}

function completeCatalogRecord(record) {
  const category = resolveQaCategory(record);
  const semanticClass = resolveQaSemanticClass({ kind: record.kind, category });
  const semanticControl = semanticClass.includes('semantic');
  const engineDecision = resolveQaEngineDecision({
    engine: record.engine,
    label: record.label,
  });
  const schedulerLane = resolveSchedulerLane(record, category);
  return Object.freeze({
    ...record,
    category,
    categoryOrder: QA_CATEGORY_ORDER[category],
    semanticClass,
    engineProfile: engineDecision.profile,
    engineDecision,
    scopeProfile: resolveQaScopeProfile({ lanes: record.lanes, category }),
    triggerProfile: record.lanes.includes('focused-triggered') ? 'catalog-trigger' : 'mode-scope',
    supportedModes: Object.freeze([...record.runsIn]),
    adapterProfiles: Object.freeze(
      record.occurrences.map(({ lane, source, tool }) => ({
        lane,
        source,
        tool,
      }))
    ),
    resourceProfile: resolveQaResourceProfile(category),
    schedulerLane,
    schedulerDependencyProfile: resolveSchedulerDependencyProfile(schedulerLane),
    dependencyProfiles:
      category === 'preparation'
        ? []
        : category === 'scope-and-admission'
          ? ['preparation']
          : ['scope-and-admission'],
    normalizationProfile: 'qa-step-result-v1',
    proof: Object.freeze({
      kind: semanticControl ? 'smell-or-invariant' : 'execution-contract',
      evidenceStatus: 'derived-closure',
    }),
  });
}

function buildCatalog() {
  const merged = new Map();
  QA_CONTROL_OCCURRENCES.forEach((occurrence, index) => {
    merged.set(occurrence.id, mergeOccurrence(merged.get(occurrence.id), occurrence, index));
  });
  return [...merged.values()]
    .map(completeCatalogRecord)
    .sort(
      (left, right) =>
        left.categoryOrder - right.categoryOrder ||
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id)
    );
}

function validateCatalog(catalog) {
  const ids = new Set();
  for (const control of catalog) {
    if (ids.has(control.id)) throw new Error(`Duplicate QA control id: ${control.id}`);
    ids.add(control.id);
    if (!Number.isInteger(control.categoryOrder)) {
      throw new Error(`Unknown QA category for ${control.id}: ${control.category}`);
    }
    if (
      control.semanticClass === 'semantic guard / analyzer' &&
      control.category === 'orchestration'
    ) {
      throw new Error(`Semantic control cannot use orchestration role: ${control.id}`);
    }
    if (!control.proof?.kind || !control.proof?.evidenceStatus) {
      throw new Error(`Incomplete QA proof metadata: ${control.id}`);
    }
    if (!control.schedulerLane || !control.schedulerDependencyProfile) {
      throw new Error(`QA control has no scheduler profile: ${control.id}`);
    }
  }
  return catalog;
}

export const QA_CONTROL_CATALOG = Object.freeze(validateCatalog(buildCatalog()));

export function selectQaControls({ lane, runsIn, semanticClass } = {}) {
  return QA_CONTROL_CATALOG.filter(
    (control) =>
      (lane == null || control.lanes.includes(lane)) &&
      (runsIn == null || control.runsIn.includes(runsIn)) &&
      (semanticClass == null || control.semanticClass === semanticClass)
  );
}

export function collectQaOccurrences({ lane } = {}) {
  return QA_CONTROL_CATALOG.flatMap((control) =>
    control.occurrences.filter((occurrence) => lane == null || occurrence.lane === lane)
  ).sort(
    (left, right) => QA_CONTROL_OCCURRENCES.indexOf(left) - QA_CONTROL_OCCURRENCES.indexOf(right)
  );
}

export function projectTupleSteps(lane) {
  return collectQaOccurrences({ lane }).map(({ id, label, tool, execution, source, runsIn }) => [
    id.replace(/^qa\.rule\./u, ''),
    label,
    tool,
    execution,
    source,
    runsIn,
  ]);
}

export function projectExecutionLabels(lane) {
  return collectQaOccurrences({ lane }).map(({ label }) => label);
}

export function orderQaResultSteps(steps) {
  const order = new Map(QA_CONTROL_CATALOG.map((control, index) => [control.label, index]));
  return [...steps].sort(
    (left, right) =>
      (order.get(left.label) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.label) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function assertAdapterClosure(adapters, lane) {
  const controls = collectQaOccurrences({ lane });
  const expected = new Set(controls.map(({ id }) => id));
  const actual = new Set(adapters.keys());
  const missing = [...expected].filter((id) => !actual.has(id));
  const unknown = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `QA adapter closure drift for ${lane}: missing=[${missing.join(', ')}] unknown=[${unknown.join(', ')}]`
    );
  }
}

export function projectAdapterSteps(adapters, lane) {
  assertAdapterClosure(adapters, lane);
  return collectQaOccurrences({ lane }).map((occurrence) => adapters.get(occurrence.id));
}
