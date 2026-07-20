import fs from 'node:fs';
import path from 'node:path';

import { createFailureStep, createOkStep } from './focused-qa-results.mjs';
import { PRODUCT_QA_SUITE } from './qa-scope.mjs';
import { fromRelativePath } from './shared.mjs';
import { measureAsyncStep } from './step-timing.helpers.mjs';
import { runUnitTests } from './verify-unit-tests.mjs';
import { collectCoverageAuditReport, formatCoverageAuditReport } from './coverage-audit-report.mjs';

const FULL_COVERAGE_DIRECTORY = '.tmp/coverage/unit';
const FULL_COVERAGE_MAX_WORKERS = 6;

function withDuration(step, durationMs) {
  return {
    ...step,
    durationMs,
  };
}

function prepareFullCoverageDirectory() {
  const coverageDirectory = fromRelativePath(FULL_COVERAGE_DIRECTORY);
  fs.rmSync(coverageDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  fs.mkdirSync(path.join(coverageDirectory, '.tmp'), { recursive: true });
}

export async function collectFullCoverageAuditStep() {
  prepareFullCoverageDirectory();
  const { durationMs, value: unitResult } = await measureAsyncStep(() =>
    runUnitTests({
      coverage: true,
      coverageMode: 'manual',
      maxWorkers: FULL_COVERAGE_MAX_WORKERS,
      suite: PRODUCT_QA_SUITE,
    })
  );
  if (unitResult.status !== 0) {
    return withDuration(
      createFailureStep('Full product coverage', 'unit tests failed', {
        stdout: unitResult.stdout ?? '',
        stderr: unitResult.stderr ?? '',
      }),
      durationMs
    );
  }

  const coverageReport = collectCoverageAuditReport();
  if (coverageReport.error) {
    return withDuration(
      createFailureStep('Full product coverage', 'coverage report failed', {
        stderr: `${coverageReport.error}\n`,
      }),
      durationMs
    );
  }

  return withDuration(
    createOkStep('Full product coverage', formatCoverageAuditReport(coverageReport)),
    durationMs
  );
}
