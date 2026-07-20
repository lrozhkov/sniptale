import { recordSuccessfulUnitTestPlan } from './unit-test-cache.mjs';
import { createProcessStep, createSkippedStep } from './focused-qa-results.mjs';
import { timeAsyncStep, timeSyncStep } from './step-timing.helpers.mjs';
import { resolveCoverageTargetFiles } from './verify-test-coverage.mjs';
import { resolveFocusedCoverageOwnerScope } from './focused-coverage-owner-resolver.mjs';
import { runUnitTests } from './verify-unit-tests.mjs';
import { isProductQaFile, PRODUCT_QA_SUITE } from './qa-scope.mjs';
import { filterImportOnlyDiffFiles, filterImportOrMockOnlyDiffFiles } from './import-only-diff.mjs';
import { createFocusedCoverageResult } from './verify-focused.coverage-result.helpers.mjs';
import { createFocusedEarlyExitSteps } from './verify-focused.blocked-steps.helpers.mjs';
import { createImportOnlyCodeFocusedSteps } from './verify-focused.import-only-steps.helpers.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export function resolveFocusedCoverageTargetFiles(files = []) {
  return resolveCoverageTargetFiles({ files, changedWorkspaceFiles: files });
}

export function collectFocusedDiffTestFiles(files = []) {
  return filterImportOrMockOnlyDiffFiles(
    files.filter((file) => isProductQaFile(file) && TEST_FILE_PATTERN.test(file))
  );
}

function createNoCodeFocusedSteps() {
  return [
    timeSyncStep(() => createSkippedStep('Unit tests')),
    timeSyncStep(() =>
      createSkippedStep('Test coverage', 'skipped: no changed production files in rollout scope')
    ),
  ];
}

async function runDirectTestsWithoutCoverage({ directTestFiles, runUnitTestsImpl, targetFiles }) {
  const unitTestStep = await collectRunnableFocusedUnitStep({
    coverageTargetFiles: [],
    profile: 'checkpoint-direct',
    testFiles: directTestFiles,
    shouldRunCoverage: false,
    runUnitTestsImpl,
  });
  recordFocusedUnitPlan({
    coverageTargetFiles: [],
    testFiles: directTestFiles,
    shouldRunCoverage: false,
    targetFiles,
    unitTestStep,
  });

  return unitTestStep;
}

function recordFocusedUnitPlan({
  coverageTargetFiles,
  testFiles,
  shouldRunCoverage,
  targetFiles,
  unitTestStep,
}) {
  if (unitTestStep.status === 'ok' && testFiles.length > 0) {
    recordSuccessfulUnitTestPlan({
      targetFiles,
      relatedFiles: testFiles,
      coverage: shouldRunCoverage,
      coverageMode: shouldRunCoverage ? 'diff' : 'manual',
      coverageTargets: coverageTargetFiles,
      source: 'focused',
    });
  }
}

async function collectRunnableFocusedUnitStep({
  coverageTargetFiles,
  profile = 'checkpoint-owner',
  testFiles,
  shouldRunCoverage,
  runUnitTestsImpl = runUnitTests,
}) {
  if (testFiles.length === 0) {
    return timeSyncStep(() =>
      createSkippedStep('Unit tests', 'skipped: no local test owner in diff')
    );
  }

  return timeAsyncStep(async () => {
    const step = createProcessStep(
      'Unit tests',
      await runUnitTestsImpl({
        directFiles: testFiles,
        coverage: shouldRunCoverage,
        coverageMode: 'diff',
        coverageTargets: coverageTargetFiles,
        suite: PRODUCT_QA_SUITE,
      })
    );
    return step.status === 'ok'
      ? {
          ...step,
          detail: `profile=${profile}; direct tests=${testFiles.length}`,
        }
      : step;
  });
}

function resolveFocusedScope({ codeFiles, directTestFiles, focusedScopeOverride, newFiles }) {
  return (
    focusedScopeOverride ??
    resolveFocusedCoverageOwnerScope({
      codeFiles,
      directTestFiles,
      newFiles,
    })
  );
}

async function createRunnableFocusedSteps({
  codeFiles,
  focusedScope,
  runUnitTestsImpl,
  targetFiles,
}) {
  const shouldRunCoverage = focusedScope.verdict === 'run-local-coverage';
  const unitTestStep = await collectRunnableFocusedUnitStep({
    coverageTargetFiles: focusedScope.coverageTargetFiles,
    testFiles: focusedScope.testFiles,
    shouldRunCoverage,
    runUnitTestsImpl,
  });
  recordFocusedUnitPlan({
    coverageTargetFiles: focusedScope.coverageTargetFiles,
    testFiles: focusedScope.testFiles,
    shouldRunCoverage,
    targetFiles,
    unitTestStep,
  });

  return [
    unitTestStep,
    timeSyncStep(() =>
      createFocusedCoverageResult({
        codeFiles,
        coverageTargetFiles: focusedScope.coverageTargetFiles,
        directTestFiles: focusedScope.testFiles,
        shouldRunCoverage,
        unitTestStep,
      })
    ),
  ];
}

export async function runFocusedUnitTests(
  { codeFiles, newFiles = [], targetFiles },
  { focusedScopeOverride, runUnitTestsImpl } = {}
) {
  const directTestFiles = collectFocusedDiffTestFiles(targetFiles);
  if (codeFiles.length === 0) {
    return createNoCodeFocusedSteps();
  }

  const behavioralCodeFiles = filterImportOnlyDiffFiles(codeFiles);
  if (behavioralCodeFiles.length === 0) {
    return createImportOnlyCodeFocusedSteps({
      directTestFiles,
      runDirectTestsWithoutCoverage: () =>
        runDirectTestsWithoutCoverage({ directTestFiles, runUnitTestsImpl, targetFiles }),
    });
  }

  const focusedScope = resolveFocusedScope({
    codeFiles: behavioralCodeFiles,
    directTestFiles,
    focusedScopeOverride,
    newFiles,
  });
  const earlyExitSteps = createFocusedEarlyExitSteps({
    codeFiles: behavioralCodeFiles,
    directTestFiles,
    focusedScope,
  });
  if (earlyExitSteps) {
    return earlyExitSteps;
  }

  return createRunnableFocusedSteps({
    codeFiles: behavioralCodeFiles,
    focusedScope,
    runUnitTestsImpl,
    targetFiles,
  });
}
