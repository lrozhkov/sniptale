import { createViolationStep } from './focused-qa-results.mjs';
import { measureSyncStep } from './step-timing.helpers.mjs';
import { VERIFY_ALL_VIOLATION_STEPS } from './verify-all.violation-steps.mjs';

export function collectViolationSteps({ codeFiles, releaseMode, targetFiles }) {
  const runnerScope = releaseMode
    ? { scope: 'repo-wide' }
    : { files: codeFiles, scope: 'workspace', targetFiles };
  return VERIFY_ALL_VIOLATION_STEPS.map(([label, header, runner]) => {
    const { durationMs, value: result } = measureSyncStep(() => runner(runnerScope));
    return { ...createViolationStep(label, header, result), durationMs };
  });
}
