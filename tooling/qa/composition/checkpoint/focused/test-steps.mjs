import fs from 'node:fs';
import {
  resolveMappedCoverageOwnerTests,
  collectFocusedCoverageOwnerMappingViolations,
} from '../../../proof/focused-coverage/focused-coverage-owner-map.mjs';

import { recordSuccessfulUnitTestPlan } from '../../../proof/unit/unit-test-cache.mjs';
import { createProcessStep, createSkippedStep } from '../focused-qa-results.mjs';
import {
  timeAsyncStep,
  timeSyncStep,
} from '../../../runtime/observability/step-timing.helpers.mjs';
import { resolveCoverageTargetFiles } from '../../../proof/coverage/test-coverage/check.mjs';
import { resolveFocusedCoverageOwnerScope } from '../../../proof/focused-coverage/focused-coverage-owner-resolver/check.mjs';
import { runUnitTests } from '../../../proof/unit/verify-unit-tests.mjs';
import { isProductQaFile, PRODUCT_QA_SUITE } from '../../scope/qa-scope.mjs';
import {
  filterImportOnlyDiffFiles,
  filterImportOrMockOnlyDiffFiles,
} from '../../../analysis/imports/import-only-diff/check.mjs';
import { createFocusedCoverageResult } from './coverage-result.mjs';
import { createReusableFullProofSteps } from './full-proof-steps.mjs';
import { createFocusedEarlyExitSteps } from './blocked-steps.mjs';
import { createImportOnlyCodeFocusedSteps } from './import-only-steps.mjs';
import { fromRelativePath } from '../../../analysis/repository/shared-paths.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export function resolveFocusedCoverageTargetFiles(files = []) {
  return resolveCoverageTargetFiles({ files, changedWorkspaceFiles: files });
}

export function collectFocusedDiffTestFiles(files = []) {
  return filterImportOrMockOnlyDiffFiles(
    files.filter(
      (file) =>
        isProductQaFile(file) &&
        TEST_FILE_PATTERN.test(file) &&
        fs.existsSync(fromRelativePath(file))
    )
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

async function runDirectTestsWithoutCoverage({
  directTestFiles,
  maxWorkers,
  pool,
  runUnitTestsImpl,
  targetFiles,
}) {
  const unitTestStep = await collectRunnableFocusedUnitStep({
    coverageTargetFiles: [],
    profile: 'checkpoint-direct',
    testFiles: directTestFiles,
    shouldRunCoverage: false,
    maxWorkers,
    pool,
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
  maxWorkers,
  pool,
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
        ...(maxWorkers == null ? {} : { maxWorkers }),
        ...(pool == null ? {} : { pool }),
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
  maxWorkers,
  pool,
  runUnitTestsImpl,
  targetFiles,
}) {
  const shouldRunCoverage = focusedScope.verdict === 'run-local-coverage';
  const unitTestStep = await collectRunnableFocusedUnitStep({
    coverageTargetFiles: focusedScope.coverageTargetFiles,
    testFiles: focusedScope.testFiles,
    shouldRunCoverage,
    maxWorkers,
    pool,
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

async function runCodeFocusedUnitTests(
  { codeFiles, newFiles = [], targetFiles },
  { focusedScopeOverride, maxWorkers, pool, runUnitTestsImpl, dataTestFiles = [] } = {}
) {
  const directTestFiles = [
    ...new Set([...collectFocusedDiffTestFiles(targetFiles), ...dataTestFiles]),
  ].sort();
  if (codeFiles.length === 0) {
    if (dataTestFiles.length === 0) return createNoCodeFocusedSteps();
    return [
      await runDirectTestsWithoutCoverage({
        directTestFiles,
        maxWorkers,
        pool,
        runUnitTestsImpl,
        targetFiles,
      }),
      timeSyncStep(() =>
        createSkippedStep('Test coverage', 'skipped: catalog data has no code coverage target')
      ),
    ];
  }

  const behavioralCodeFiles = filterImportOnlyDiffFiles(codeFiles);
  if (behavioralCodeFiles.length === 0) {
    return createImportOnlyCodeFocusedSteps({
      directTestFiles,
      runDirectTestsWithoutCoverage: () =>
        runDirectTestsWithoutCoverage({
          directTestFiles,
          maxWorkers,
          pool,
          runUnitTestsImpl,
          targetFiles,
        }),
    });
  }

  const focusedScope = resolveFocusedScope({
    codeFiles: behavioralCodeFiles,
    directTestFiles,
    focusedScopeOverride,
    newFiles,
  });
  if (focusedScope.verdict === 'defer-ambiguous-existing') {
    const fullProofSteps = createReusableFullProofSteps({ codeFiles, pool });
    if (fullProofSteps) return fullProofSteps;
  }
  const earlyExitSteps = createFocusedEarlyExitSteps({
    codeFiles: behavioralCodeFiles,
    directTestFiles,
    focusedScope,
    maxWorkers,
    pool,
  });
  if (earlyExitSteps) {
    return earlyExitSteps;
  }

  return createRunnableFocusedSteps({
    codeFiles: behavioralCodeFiles,
    focusedScope,
    maxWorkers,
    pool,
    runUnitTestsImpl,
    targetFiles,
  });
}

export async function runFocusedUnitTests(context, options = {}) {
  const catalogFiles = context.targetFiles.filter((file) =>
    /^apps\/extension\/src\/platform\/i18n\/catalogs\/[^/]+\.json$/u.test(file)
  );
  if (catalogFiles.length === 0) return runCodeFocusedUnitTests(context, options);
  const mappedTests = [
    ...new Set(catalogFiles.flatMap((file) => resolveMappedCoverageOwnerTests(file))),
  ];
  const violations = collectFocusedCoverageOwnerMappingViolations();
  if (mappedTests.length === 0 || violations.length > 0) {
    return [
      timeSyncStep(() =>
        createProcessStep('Unit tests', {
          status: 1,
          stdout: '',
          stderr:
            mappedTests.length === 0
              ? 'Catalog data has no proof owner'
              : JSON.stringify(violations),
        })
      ),
    ];
  }
  return runCodeFocusedUnitTests(context, {
    ...options,
    dataTestFiles: mappedTests.filter(isProductQaFile),
  });
}
