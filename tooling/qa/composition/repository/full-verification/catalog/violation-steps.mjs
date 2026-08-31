import { createSkippedStep, createViolationStep } from '../../../checkpoint/focused-qa-results.mjs';
import { isOwnerGuardLabel } from '../../../shared/owner-guard-step-helpers.mjs';
import { measureAsyncStep } from '../../../../runtime/observability/step-timing.helpers.mjs';
import { VERIFY_ALL_VIOLATION_STEPS } from '../violation-steps.mjs';
import { runUnifiedAstGrepReceipt } from '../../../../audits/ast-grep/unified-ast-grep.mjs';

export async function collectViolationSteps(
  { codeFiles, deferOwnerGuards = false, excludedControlLabels = [], releaseMode, targetFiles },
  violationSteps = VERIFY_ALL_VIOLATION_STEPS
) {
  const runnerScope = releaseMode
    ? { scope: 'repo-wide' }
    : { files: codeFiles, scope: 'workspace', targetFiles };
  const astGrepReceipt =
    codeFiles.length > 0 ? runUnifiedAstGrepReceipt({ files: codeFiles }) : null;
  const steps = [];
  for (const [label, header, runner] of violationSteps) {
    if (excludedControlLabels.includes(label)) continue;
    if (deferOwnerGuards && isOwnerGuardLabel(label)) {
      steps.push(createSkippedStep(label, 'scheduled in bounded owner lane'));
      continue;
    }
    const { durationMs, value: result } = await measureAsyncStep(() =>
      runner({ ...runnerScope, astGrepReceipt })
    );
    steps.push({ ...createViolationStep(label, header, result), durationMs });
  }
  return steps;
}
