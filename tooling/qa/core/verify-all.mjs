import { finalizeFocusedResults, printStepResult } from './focused-qa-results.mjs';
import { printOk } from './verify-all.helpers.mjs';
import { collectFullVerifyStepResults } from './verify-all.execution.mjs';
import { isExecutedAsScript } from './shared.mjs';

export async function runFullVerify({
  releaseMode = process.argv.includes('--release-tests'),
  summaryLabel = 'Summary',
} = {}) {
  const result = await collectFullVerifyStepResults({ releaseMode });
  printOk('Unit test scope', result.scopeDetail);
  for (const step of result.steps) {
    printStepResult(step);
  }
  finalizeFocusedResults(result.steps, summaryLabel);
}

if (isExecutedAsScript(import.meta.url)) {
  await runFullVerify();
}
