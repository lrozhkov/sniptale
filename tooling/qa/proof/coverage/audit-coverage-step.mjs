import fs from 'node:fs';
import path from 'node:path';

import { resolveQaResourceProfile } from '../../runtime/scheduling/resource-profile.mjs';
import {
  createFailureStep,
  createOkStep,
} from '../../composition/checkpoint/focused-qa-results.mjs';
import { PRODUCT_QA_SUITE } from '../../composition/scope/qa-scope.mjs';
import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';
import { measureAsyncStep } from '../../runtime/observability/step-timing.helpers.mjs';
import { resolveProductUnitTestPool, runUnitTests } from '../unit/verify-unit-tests.mjs';
import {
  collectCoverageAuditReport,
  formatCoverageAuditReport,
  writeCanonicalCoverageArtifacts,
} from './coverage-audit-report.mjs';
import {
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
} from './coverage-proof.mjs';

const FULL_COVERAGE_DIRECTORY = '.tmp/coverage/unit';

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

export async function collectFullCoverageAuditStep({
  maxWorkers = resolveQaResourceProfile().vitestMaxWorkers,
} = {}) {
  const reusable = resolveReusableCoverageProof();
  if (reusable.matched) {
    materializeReusableCoverageProof(reusable);
    recordSuccessfulCoverageProof({ reusedFrom: reusable.proof.producer ?? null });
    return withDuration(
      createOkStep('Full product coverage', `reused verified ${reusable.source}`),
      0
    );
  }
  prepareFullCoverageDirectory();
  const { durationMs, value: unitResult } = await measureAsyncStep(() =>
    runUnitTests({
      coverage: true,
      coverageMode: 'manual',
      maxWorkers,
      pool: resolveProductUnitTestPool(),
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

  try {
    writeCanonicalCoverageArtifacts({ report: coverageReport });
    recordSuccessfulCoverageProof();
  } catch (error) {
    return withDuration(
      createFailureStep('Full product coverage', 'coverage publication failed', {
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      }),
      durationMs
    );
  }

  return withDuration(
    createOkStep('Full product coverage', formatCoverageAuditReport(coverageReport)),
    durationMs
  );
}
