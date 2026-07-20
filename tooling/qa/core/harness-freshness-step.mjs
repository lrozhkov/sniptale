import { createOkStep } from './focused-qa-results.mjs';
import { HARNESS_QA_GUIDANCE, hasHarnessQaTargets } from './qa-scope.mjs';
import { assertFreshHarnessState } from './verify-harness.state.helpers.mjs';

export function collectHarnessFreshnessStep(
  context,
  harnessStateAsserter = assertFreshHarnessState,
  consumerLabel = 'qa:checkpoint'
) {
  if (!hasHarnessQaTargets(context)) {
    return null;
  }

  try {
    harnessStateAsserter(context, consumerLabel);
    return createOkStep('Harness QA', 'fresh qa:release-harness stamp');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label: 'Harness QA',
      status: 'failed',
      summary: 'stale qa:release-harness stamp',
      stderr: `${message}\n${HARNESS_QA_GUIDANCE}\n`,
      durationMs: 0,
    };
  }
}
