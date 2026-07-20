import { createFailureStep, createOkStep, createSkippedStep } from './focused-qa-results.mjs';
import {
  collectCoverageResidualReport,
  summarizeCoverageResidualReport,
} from './verify-test-coverage.advisory.mjs';
import { runTestCoverageCheck } from './verify-test-coverage.mjs';
import { recordSuccessfulUnitTestPlan, resolveReusableUnitTestPlan } from './unit-test-cache.mjs';
import { runUnitTests } from './verify-unit-tests.mjs';
import { PRODUCT_QA_SUITE } from './qa-scope.mjs';
import { measureAsyncStep, measureSyncStep } from './step-timing.helpers.mjs';
import { createPlannedCoverage, getCoverageMode, hasCoverage } from './unit-test-coverage-plan.mjs';
import {
  createDirectUnitTestStep,
  createFailedUnitTestStep,
  createRelatedUnitTestOkStep,
  createReusableUnitTestStep,
} from './verify-all.unit-test-results.mjs';

function createCoverageFailureStep(coverageResult, releaseMode, durationMs) {
  const residualReport = summarizeCoverageResidualReport(
    collectCoverageResidualReport({ files: coverageResult.files })
  );
  return createFailureStep('Test coverage', 'violations found', {
    header: releaseMode
      ? 'Release coverage violations found:'
      : 'Diff-based test coverage violations found:',
    violations: coverageResult.violations,
    advice: [
      ...residualReport,
      'prefer owner-local mapped tests when the coverage registry has a matching owner',
    ].join('; '),
    durationMs,
  });
}

async function collectDirectUnitTestStepResult({
  coveragePlan,
  pool,
  suite,
  unitTestDetailOverride,
}) {
  const { durationMs, value: unitTestResult } = await measureAsyncStep(() =>
    runUnitTests({
      coverage: hasCoverage(coveragePlan),
      coverageMode: getCoverageMode(coveragePlan),
      coverageTargets: coveragePlan.coverageTargetFiles,
      directFiles: coveragePlan.directFiles,
      pool,
      suite,
    })
  );

  return createDirectUnitTestStep({
    directFiles: coveragePlan.directFiles,
    unitTestDetailOverride,
    unitTestResult,
    durationMs,
  });
}

function recordPassedRelatedUnitTestPlan({ cacheSource, coveragePlan, pool, suite, targetFiles }) {
  recordSuccessfulUnitTestPlan({
    targetFiles,
    relatedFiles: coveragePlan.relatedFiles,
    coverage: hasCoverage(coveragePlan),
    coverageMode: getCoverageMode(coveragePlan),
    coverageTargets: coveragePlan.coverageTargetFiles,
    pool,
    source: cacheSource,
    suite,
  });
}

function resolveReusableRelatedUnitTestPlan({ coveragePlan, pool, suite, targetFiles }) {
  return resolveReusableUnitTestPlan({
    targetFiles,
    relatedFiles: coveragePlan.relatedFiles,
    coverage: hasCoverage(coveragePlan),
    coverageMode: getCoverageMode(coveragePlan),
    coverageTargets: coveragePlan.coverageTargetFiles,
    pool,
    suite,
  });
}

async function runRelatedUnitTests({ coveragePlan, pool, suite }) {
  return measureAsyncStep(() =>
    runUnitTests({
      coverage: hasCoverage(coveragePlan),
      coverageMode: getCoverageMode(coveragePlan),
      coverageTargets: coveragePlan.coverageTargetFiles,
      pool,
      relatedFiles: coveragePlan.relatedFiles,
      suite,
    })
  );
}

async function collectRelatedUnitTestStepResult({
  cacheSource,
  coveragePlan,
  pool,
  suite,
  targetFiles,
  unitTestDetailOverride,
}) {
  const reusableUnitTestPlan = coveragePlan.forceFullSuite
    ? { matched: false }
    : resolveReusableRelatedUnitTestPlan({
        coveragePlan,
        pool,
        suite,
        targetFiles,
      });

  if (reusableUnitTestPlan.matched) {
    return createReusableUnitTestStep(reusableUnitTestPlan, 0, unitTestDetailOverride);
  }

  const { durationMs, value: unitTestResult } = await runRelatedUnitTests({
    coveragePlan,
    pool,
    suite,
  });
  if (unitTestResult.status !== 0) {
    return createFailedUnitTestStep(unitTestResult, durationMs);
  }

  recordPassedRelatedUnitTestPlan({
    cacheSource,
    coveragePlan,
    pool,
    suite,
    targetFiles,
  });

  return createRelatedUnitTestOkStep({
    durationMs,
    unitTestDetailOverride,
  });
}

async function collectUnitTestStepResult({
  cacheSource,
  coveragePlan,
  pool,
  releaseMode,
  suite,
  targetFiles,
  unitTestDetailOverride,
}) {
  const startedAtMs = Date.now();
  if (
    !releaseMode &&
    !coveragePlan.forceFullSuite &&
    coveragePlan.relatedFiles.length === 0 &&
    coveragePlan.directFiles.length === 0
  ) {
    return {
      ...createSkippedStep('Unit tests', 'no matching files'),
      durationMs: Date.now() - startedAtMs,
    };
  }

  if (coveragePlan.directFiles.length > 0 && coveragePlan.relatedFiles.length === 0) {
    return collectDirectUnitTestStepResult({
      coveragePlan,
      pool,
      suite,
      unitTestDetailOverride,
    });
  }

  const relatedStep = await collectRelatedUnitTestStepResult({
    cacheSource,
    coveragePlan,
    pool,
    suite,
    targetFiles,
    unitTestDetailOverride,
  });
  if (relatedStep.durationMs === 0 && relatedStep.status === 'ok') {
    return {
      ...relatedStep,
      durationMs: Date.now() - startedAtMs,
    };
  }

  return relatedStep;
}

function collectCoverageStepResult({ coveragePlan, releaseMode }) {
  const startedAtMs = Date.now();
  if (coveragePlan.mode === 'skip') {
    return {
      ...createSkippedStep('Test coverage', coveragePlan.detail),
      durationMs: Date.now() - startedAtMs,
    };
  }

  const { durationMs, value: coverageResult } = measureSyncStep(() =>
    runTestCoverageCheck({
      files: coveragePlan.coverageCheckFiles,
      mode: coveragePlan.mode === 'full' ? 'full' : 'changed',
    })
  );
  if (coverageResult.error) {
    return createFailureStep('Test coverage', 'failed', {
      stderr: `${coverageResult.error}\n`,
      durationMs,
    });
  }
  if (coverageResult.skipped) {
    return {
      ...createSkippedStep('Test coverage', coveragePlan.detail),
      durationMs,
    };
  }
  if (coverageResult.violations.length > 0) {
    return createCoverageFailureStep(coverageResult, releaseMode, durationMs);
  }

  return {
    ...createOkStep('Test coverage', coveragePlan.detail),
    durationMs,
  };
}

export async function collectUnitTestAndCoverageStepResults({
  cacheSource = 'full-verify',
  codeFiles,
  coverageEnabled = true,
  coverageDetailOverride,
  directFilesOverride = [],
  fullSuiteOverride = false,
  relatedFilesOverride,
  releaseMode,
  pool = null,
  suite = PRODUCT_QA_SUITE,
  targetFiles,
  unitTestDetailOverride,
}) {
  const plannedCoverage = createPlannedCoverage({
    codeFiles,
    coverageDetailOverride,
    coverageEnabled,
    directFilesOverride,
    fullSuiteOverride,
    relatedFilesOverride,
    releaseMode,
  });
  const unitTestStep = await collectUnitTestStepResult({
    cacheSource,
    coveragePlan: plannedCoverage,
    pool,
    releaseMode,
    suite,
    targetFiles,
    unitTestDetailOverride,
  });
  const coverageStep =
    unitTestStep.status === 'failed'
      ? createSkippedStep('Test coverage', 'skipped: unit tests failed')
      : collectCoverageStepResult({ coveragePlan: plannedCoverage, releaseMode });
  return [unitTestStep, coverageStep];
}
