import { createScopedQaContext, HARNESS_QA_SUITE } from '../core/qa-scope.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { collectHarnessStepResults } from '../core/verify-harness.execution.mjs';
import { createHarnessState, writeHarnessState } from '../core/verify-harness.state.helpers.mjs';
import { isExecutedAsScript } from '../core/shared.mjs';
import { assertQaResultContract } from '../core/qa-steps/contract.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

export async function runReleaseHarness({
  producerRunId,
  contextCollector = collectCurrentDiffContext,
  harnessStepCollector = collectHarnessStepResults,
  stateWriter = writeHarnessState,
  executionContractAsserter = assertQaResultContract,
} = {}) {
  const context = createScopedQaContext(contextCollector(), { suite: HARNESS_QA_SUITE });
  const result = await harnessStepCollector({ context });
  const failedStep = result.steps.find((step) => step.status === 'failed');

  const observedResult = {
    context,
    executionMode: result.skipped ? 'no-targets' : 'default',
    skipped: result.skipped,
    steps: result.steps,
  };
  executionContractAsserter({ wrapperId: 'qa:release-harness', result: observedResult });
  stateWriter(
    createHarnessState({
      context,
      success: !failedStep,
      skipped: result.skipped,
      errorMessage: failedStep ? `${failedStep.label} failed` : '',
      producerRunId,
    })
  );

  return observedResult;
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:release-harness',
    label: 'QA release harness',
    blocking: true,
    execute: async ({ session }) => runReleaseHarness({ producerRunId: session.runId }),
  });
  process.exitCode = outcome.exitCode;
}
