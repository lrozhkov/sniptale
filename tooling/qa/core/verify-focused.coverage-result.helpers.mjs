import fs from 'node:fs';

import {
  createFailureStep,
  createSkippedStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { runTestCoverageCheck } from './verify-test-coverage.mjs';

const COVERAGE_REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';

function runFocusedCoverageStep({ codeFiles, coverageTargetFiles, unitTestStep }) {
  if (coverageTargetFiles.length === 0) {
    return createSkippedStep(
      'Test coverage',
      'skipped: no changed production files in rollout scope'
    );
  }

  const coverageResult = runTestCoverageCheck({ files: codeFiles });
  if (!coverageResult.error) {
    return createViolationStep(
      'Test coverage',
      'Diff-based test coverage violations found:',
      coverageResult
    );
  }

  if (unitTestStep.status === 'failed' && !fs.existsSync(COVERAGE_REPORT_PATH)) {
    return createSkippedStep(
      'Test coverage',
      'not evaluated: unit-test run failed before coverage artifact creation'
    );
  }

  return createFailureStep('Test coverage', 'failed', {
    stderr: coverageResult.error,
  });
}

export function createFocusedCoverageResult({
  codeFiles,
  coverageTargetFiles,
  directTestFiles,
  shouldRunCoverage,
  unitTestStep,
}) {
  if (directTestFiles.length === 0) {
    return createSkippedStep('Test coverage', 'skipped: no changed test files in diff');
  }
  if (!shouldRunCoverage) {
    return createSkippedStep('Test coverage', 'skipped: no coverage target files in diff');
  }

  return runFocusedCoverageStep({ coverageTargetFiles, codeFiles, unitTestStep });
}
