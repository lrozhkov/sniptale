// Compatibility projections. Membership and ordering are owned by the categorized catalog.
import { collectQaOccurrences, projectTupleSteps } from './catalog.mjs';
export { CANONICAL_WRAPPER_IDS } from './catalog.data.mjs';

export const RELEASE_DIRECT_STEPS = projectTupleSteps('release-direct');
export const FOCUSED_DIRECT_STEPS = projectTupleSteps('focused-direct');
export const FOCUSED_TRIGGERED_RUNTIME_STEPS = projectTupleSteps('focused-triggered');
export const HARNESS_STEPS = projectTupleSteps('harness');
export const BUILD_STEPS = projectTupleSteps('build');
export const BUILD_COMMIT_STEPS = projectTupleSteps('build-commit');
export const CLOSEOUT_STEPS = projectTupleSteps('closeout');
export const CI_COMPOSITION_STEPS = projectTupleSteps('ci-composition');
export const WRAPPER_LIFECYCLE_STEPS = projectTupleSteps('wrapper-lifecycle');
export const E2E_STEPS = projectTupleSteps('e2e');
export const ADVISORY_STEPS = projectTupleSteps('advisory');
export const STRUCTURAL_AUDIT_STEPS = projectTupleSteps('structural-audit');
export const AUDIT_STEPS = projectTupleSteps('audit');

function projectToolMap(lane) {
  return new Map(collectQaOccurrences({ lane }).map(({ label, tool }) => [label, tool]));
}

export const FULL_VIOLATION_STEP_TOOLS = projectToolMap('release-guardrail');
export const FOCUSED_VIOLATION_STEP_TOOLS = projectToolMap('focused-guardrail');
