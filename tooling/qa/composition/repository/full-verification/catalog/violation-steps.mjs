import { createSkippedStep, createViolationStep } from '../../../checkpoint/focused-qa-results.mjs';
import { isOwnerGuardLabel } from '../../../shared/owner-guard-step-helpers.mjs';
import { measureAsyncStep } from '../../../../runtime/observability/step-timing.helpers.mjs';
import { VERIFY_ALL_VIOLATION_STEPS } from '../violation-steps.mjs';
import { runUnifiedAstGrepReceipt } from '../../../../audits/ast-grep/unified-ast-grep.mjs';
import { filterAllowedViolations } from '../../../../policy/baselines/shared-baseline.mjs';

export async function collectViolationSteps(
  {
    baseline,
    codeFiles,
    deferOwnerGuards = false,
    excludedControlLabels = [],
    releaseMode,
    targetFiles,
  },
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
    const { durationMs, value: rawResult } = await measureAsyncStep(() =>
      runner({ ...runnerScope, astGrepReceipt })
    );
    const baselineResult = baseline
      ? { ...rawResult, violations: filterAllowedViolations(rawResult.violations, baseline) }
      : rawResult;
    const result = releaseMode
      ? { ...baselineResult, files: baselineResult.files ?? codeFiles, scope: 'repo-wide' }
      : baselineResult;
    steps.push({ ...createViolationStep(label, header, result), durationMs });
  }
  return steps;
}
