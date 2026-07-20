import { collectQaStepDefinitionsByLane } from '../../core/qa-steps/definitions.mjs';

export { ADVISORY_SCRIPT_IDS, REPO_AUDIT_REPORT_DEFINITIONS } from './registry.data.mjs';

function compact(occurrence) {
  return {
    id: occurrence.id,
    toolId: occurrence.toolId,
    label: occurrence.label,
    kind: occurrence.kind,
    engine: occurrence.engine,
    tool: occurrence.tool,
    source: occurrence.lane,
    definitionSource: occurrence.source,
    runsIn: occurrence.runsIn,
    requiredBy: occurrence.requiredBy,
    execution: occurrence.execution,
    skipPolicy: occurrence.skipPolicy,
    owner: occurrence.owner,
    status: occurrence.status,
    expectedNoise: occurrence.expectedNoise,
    truthSource: occurrence.truthSource,
    remediation: occurrence.remediation,
    ruleDoc: occurrence.ruleDoc,
  };
}

function collectLane(lanes, lane) {
  return (lanes[lane] ?? []).map(compact);
}

const lanes = collectQaStepDefinitionsByLane();

export const FULL_DIRECT_WRAPPER_STEPS = collectLane(lanes, 'release-direct');
export const FOCUSED_DIRECT_WRAPPER_STEPS = collectLane(lanes, 'focused-direct');
export const HARNESS_DIRECT_WRAPPER_STEPS = collectLane(lanes, 'harness');
export const FOCUSED_CONDITIONAL_WRAPPER_STEPS = collectLane(lanes, 'focused-triggered');

export function collectWrapperStepDefinitions() {
  return {
    full: [...collectLane(lanes, 'release-direct'), ...collectLane(lanes, 'release-guardrail')],
    focused: [...collectLane(lanes, 'focused-direct'), ...collectLane(lanes, 'focused-guardrail')],
    focusedTriggered: collectLane(lanes, 'focused-triggered'),
    harness: collectLane(lanes, 'harness'),
    build: [...collectLane(lanes, 'build'), ...collectLane(lanes, 'build-commit')],
    closeout: collectLane(lanes, 'closeout'),
    lifecycle: collectLane(lanes, 'wrapper-lifecycle'),
    e2e: collectLane(lanes, 'e2e'),
    audit: collectLane(lanes, 'audit'),
    advisory: collectLane(lanes, 'advisory'),
    manual: collectLane(lanes, 'manual'),
  };
}
