import { createScopedQaContext, HARNESS_QA_SUITE } from '../composition/scope/qa-scope.mjs';
import { collectCurrentDiffContext } from '../runtime/scope/current-diff.helpers.mjs';
import { collectHarnessStepResults } from '../composition/harness/execution/execution.mjs';
import { createHarnessState, writeHarnessState } from '../composition/harness/execution/state.mjs';
import { loadBaseline } from '../policy/baselines/shared-baseline.mjs';
import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { assertQaResultContract } from '../composition/catalog/contract.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

export async function runReleaseHarness({
  producerRunId,
  contextCollector = collectCurrentDiffContext,
  harnessStepCollector = collectHarnessStepResults,
  baselineLoader = loadBaseline,
  stateWriter = writeHarnessState,
  executionContractAsserter = assertQaResultContract,
} = {}) {
  const baseline = baselineLoader();
  const collectContext = () => ({
    ...createScopedQaContext(contextCollector(), { suite: HARNESS_QA_SUITE }),
    baseline,
  });
  const executionContext = collectContext();
  const result = await harnessStepCollector({ context: executionContext });
  // Formatting is a write barrier. Publish proof for the resulting diff, not
  // the pre-format content that entered the wrapper.
  const context = collectContext();
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
