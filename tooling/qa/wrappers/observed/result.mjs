import { collectQaResultSteps } from '../../core/qa-steps/contract.mjs';
import { normalizeObservedStep } from './output.mjs';

export function createHelpStep() {
  return {
    label: 'Wrapper help',
    status: 'skipped',
    detail: 'help requested',
  };
}

export function resolveInvocationMode(wrapperId, values) {
  if (wrapperId === 'qa:build') {
    if (values.proofOnly) return 'proof';
    if (values.shouldCommit && values.reuseBuild) return 'reuse-commit';
    if (values.shouldCommit) return 'commit';
  }
  if (wrapperId === 'qa:e2e') {
    return `${values.suite ?? 'smoke'}-${values.headed ? 'headed' : 'headless'}`;
  }
  if (wrapperId === 'qa:closeout') return 'commit';
  if (wrapperId === 'qa:preflight' && values.files?.length > 0) return 'explicit-files';
  return 'default';
}

function attachResultContext(session, result, observationMode) {
  if (!result.context) {
    session.attachRepositoryContext({ mode: observationMode });
    return;
  }
  session.attachRepositoryContext({
    scope: result.context.scope ?? (result.context.suite ? 'current-diff' : 'workspace'),
    suite: result.context.suite ?? null,
    targetFiles: result.context.allTargetFiles ?? result.context.targetFiles ?? [],
    mode: observationMode,
  });
}

export function recordObservedResult(session, result, verbose, contract) {
  const steps = collectQaResultSteps(result);
  const executionMode =
    result.executionMode ?? (result.skipped ? 'no-targets' : contract.executionMode);
  const observationMode = result.context?.mode ?? executionMode ?? contract.invocationMode;
  attachResultContext(session, result, observationMode);
  contract.validator({
    wrapperId: contract.wrapperId,
    mode: executionMode,
    steps,
    skipped: result.skipped ?? false,
  });
  for (const step of steps) {
    const normalized = normalizeObservedStep(step);
    session.addStep(normalized.observation);
    if (verbose) process.stdout.write(normalized.observation.log);
  }
  const hasFailedStep = steps.some((step) => step.status === 'failed');
  return session.finalize(result.skipped && !hasFailedStep ? { status: 'skipped' } : undefined);
}
