import { createFailureStep, createOkStep } from './focused-qa-results.mjs';

export function createReusableUnitTestStep(
  reusableUnitTestPlan,
  durationMs,
  unitTestDetailOverride
) {
  const reuseDetail = `reused ${reusableUnitTestPlan.source} ${reusableUnitTestPlan.plan.mode} test plan`;
  return {
    ...createOkStep(
      'Unit tests',
      unitTestDetailOverride ? `${unitTestDetailOverride}; ${reuseDetail}` : reuseDetail
    ),
    durationMs,
  };
}

export function createFailedUnitTestStep(unitTestResult, durationMs) {
  return createFailureStep('Unit tests', 'failed', {
    stdout: unitTestResult.stdout,
    stderr: unitTestResult.stderr,
    advice: [
      'if one suite looks harness-flaky, rerun that suite in isolation',
      'before treating the whole full verify as deterministically red',
    ].join(' '),
    durationMs,
  });
}

export function createDirectUnitTestStep({
  directFiles = [],
  unitTestDetailOverride,
  unitTestResult,
  durationMs,
}) {
  if (unitTestResult.status !== 0) {
    return createFailedUnitTestStep(unitTestResult, durationMs);
  }

  return {
    ...createOkStep(
      'Unit tests',
      unitTestDetailOverride ?? `direct changed tests (${directFiles.length})`
    ),
    durationMs,
  };
}

export function createRelatedUnitTestOkStep({ durationMs, unitTestDetailOverride }) {
  return {
    ...createOkStep('Unit tests', unitTestDetailOverride),
    durationMs,
  };
}
