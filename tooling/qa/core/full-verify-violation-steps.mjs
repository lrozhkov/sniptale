import { createSkippedStep, createViolationStep } from './focused-qa-results.mjs';
import { isOwnerGuardLabel } from './owner-guard-step-helpers.mjs';
import { measureAsyncStep } from './step-timing.helpers.mjs';
import { VERIFY_ALL_VIOLATION_STEPS } from './verify-all.violation-steps.mjs';

export async function collectViolationSteps(
  { codeFiles, deferOwnerGuards = false, excludedControlLabels = [], releaseMode, targetFiles },
  violationSteps = VERIFY_ALL_VIOLATION_STEPS
) {
  const runnerScope = releaseMode
    ? { scope: 'repo-wide' }
    : { files: codeFiles, scope: 'workspace', targetFiles };
  const steps = [];
  for (const [label, header, runner] of violationSteps) {
    if (excludedControlLabels.includes(label)) continue;
    if (deferOwnerGuards && isOwnerGuardLabel(label)) {
      steps.push(createSkippedStep(label, 'scheduled in bounded owner lane'));
      continue;
    }
    const { durationMs, value: result } = await measureAsyncStep(() => runner(runnerScope));
    steps.push({ ...createViolationStep(label, header, result), durationMs });
  }
  return steps;
}
