import { isExecutedAsScript } from '../core/shared.mjs';
import { collectFullVerifyStepResults } from '../core/verify-all.execution.mjs';
import { resolveFullVerifyScope } from '../core/verify-all.scope.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { assertFreshHarnessState } from '../core/verify-harness.state.helpers.mjs';
import { ALL_QA_SUITE, createScopedQaContext, hasHarnessQaTargets } from '../core/qa-scope.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

export async function runReleaseWrapper({
  verifyScope = resolveFullVerifyScope(),
  contextCollector = collectCurrentDiffContext,
  harnessStateAsserter = assertFreshHarnessState,
  fullVerifyCollector = collectFullVerifyStepResults,
} = {}) {
  const currentContext = createScopedQaContext(contextCollector(), { suite: ALL_QA_SUITE });
  if (hasHarnessQaTargets(currentContext)) {
    harnessStateAsserter(currentContext, 'qa:release');
  }

  const result = await fullVerifyCollector({ releaseMode: true, verifyScope });
  return { ...result, context: currentContext };
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:release',
    label: 'QA release',
    blocking: true,
    execute: async () => runReleaseWrapper(),
  });
  process.exitCode = outcome.exitCode;
}
