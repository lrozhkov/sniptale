import { createSkippedStep } from './focused-qa-results.mjs';
import { timeSyncStep } from './step-timing.helpers.mjs';

export async function createImportOnlyCodeFocusedSteps({
  directTestFiles,
  runDirectTestsWithoutCoverage,
}) {
  if (directTestFiles.length > 0) {
    return [
      await runDirectTestsWithoutCoverage(),
      timeSyncStep(() => createSkippedStep('Test coverage', 'skipped: import-only code diff')),
    ];
  }

  return [
    timeSyncStep(() => createSkippedStep('Unit tests', 'skipped: import-only code diff')),
    timeSyncStep(() =>
      createSkippedStep('Test coverage', 'skipped: no changed production files in rollout scope')
    ),
  ];
}
