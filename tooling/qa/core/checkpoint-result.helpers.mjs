import { createCheckpointState, writeCheckpointState } from './verify-checkpoint.state.helpers.mjs';
import { assertQaResultContract } from './qa-steps/contract.mjs';

export function persistCheckpointResult(
  result,
  {
    producerRunId,
    contractValidator = assertQaResultContract,
    stateWriter = writeCheckpointState,
  } = {}
) {
  contractValidator({ wrapperId: 'qa:checkpoint', result });
  const hasFailure = result.steps.some((step) => step.status === 'failed');
  stateWriter(
    createCheckpointState({
      context: result.context,
      success: !hasFailure,
      errorMessage: hasFailure ? 'blocking checkpoint steps failed' : '',
      skipped: result.skipped,
      producerRunId,
    })
  );
  return result;
}

export function createSkippedCheckpointResult(context, steps, { readyForBuild = false } = {}) {
  return {
    context,
    executionMode: readyForBuild ? 'harness-only' : 'no-targets',
    readyForBuild,
    skipped: !readyForBuild,
    steps,
  };
}

export function createBlockedCheckpointResult(context, steps, executionMode = 'product') {
  return {
    context,
    executionMode,
    readyForBuild: false,
    skipped: false,
    steps,
  };
}

export function createNoProductCheckpointResult({
  context,
  formatStep,
  harnessFreshnessStep,
  hasHarnessTargets,
}) {
  const steps = [formatStep, harnessFreshnessStep].filter(Boolean);
  return createSkippedCheckpointResult(context, steps, {
    readyForBuild: hasHarnessTargets,
  });
}

export function createReadyCheckpointResult({ context, steps }) {
  return {
    context,
    executionMode: 'product',
    readyForBuild: true,
    skipped: false,
    steps,
  };
}

export function createCheckpointPrerequisiteResult(prerequisites, hasHarnessTargets) {
  const { context } = prerequisites;
  const executionMode =
    context.targetFiles.length > 0 ? 'product' : hasHarnessTargets ? 'harness-only' : 'no-targets';
  if (prerequisites.blockedSteps) {
    return createBlockedCheckpointResult(context, prerequisites.blockedSteps, executionMode);
  }
  if (context.targetFiles.length > 0) return null;
  return createNoProductCheckpointResult({
    context,
    formatStep: prerequisites.formatStep,
    hasHarnessTargets,
    harnessFreshnessStep: prerequisites.harnessFreshnessStep,
  });
}
