import fs from 'node:fs';
import path from 'node:path';

import { resolveQaResourceProfile } from '../../runtime/scheduling/resource-profile.mjs';
import {
  createFailureStep,
  createOkStep,
} from '../../composition/checkpoint/focused-qa-results.mjs';
import { PRODUCT_QA_SUITE } from '../../composition/scope/qa-scope.mjs';
import { measureAsyncStep } from '../../runtime/observability/step-timing.helpers.mjs';
import { resolveProductUnitTestPool } from '../unit/verify-unit-tests.mjs';
import {
  collectCoverageAuditReport,
  formatCoverageAuditReport,
  writeCanonicalCoverageArtifacts,
  CANONICAL_COVERAGE_DIRECTORY,
} from './coverage-audit-report.mjs';
import {
  createCoverageProofInputs,
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
  readVerifiedCoverageReport,
} from './coverage-proof.mjs';
import { recordSuccessfulFullUnitProof } from '../unit/unit-test-proof.mjs';
import {
  UNIT_ATTEMPTS_FILE,
  readUnitAttemptEvidence,
  runCoverageWithTimeoutRetry,
  writeUnitAttemptEvidence,
} from './coverage-timeout-retry.mjs';

const FULL_COVERAGE_DIRECTORY = '.tmp/coverage/unit';

function withDuration(step, durationMs) {
  return {
    ...step,
    durationMs,
  };
}

function prepareFullCoverageDirectory(cwd) {
  const coverageDirectory = path.join(cwd, FULL_COVERAGE_DIRECTORY);
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
  cwd = process.cwd(),
} = {}) {
  const pool = resolveProductUnitTestPool() ?? 'threads';
  const reusable = resolveReusableCoverageProof({ cwd, pool });
  if (reusable.matched) {
    try {
      const evidence = readUnitAttemptEvidence(
        readVerifiedCoverageReport(reusable, UNIT_ATTEMPTS_FILE)
      );
      materializeReusableCoverageProof(reusable, { cwd });
      recordSuccessfulCoverageProof({
        cwd,
        pool,
        inputs: reusable.inputs,
        reusedFrom: reusable.proof.proofDigest,
      });
      recordSuccessfulFullUnitProof({
        cwd,
        maxWorkers,
        pool,
        source: 'full-product-coverage',
        expectedInputDigest: reusable.proof.fullUnit.inputDigest,
        reusedFrom: reusable.proof.proofDigest,
        suite: PRODUCT_QA_SUITE,
      });
      return withDuration(
        createOkStep(
          'Full product coverage',
          `reused verified ${reusable.source}` +
            (evidence.passedOnAttempt2 ? '; passed on attempt 2' : '')
        ),
        0
      );
    } catch (error) {
      return createFailureStep('Full product coverage', 'coverage reuse failed', {
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      });
    }
  }
  const inputs = createCoverageProofInputs({ cwd, pool });
  prepareFullCoverageDirectory(cwd);
  const { durationMs, value: unitResult } = await measureAsyncStep(() =>
    runCoverageWithTimeoutRetry({
      cwd,
      maxWorkers,
      pool,
      expectedInputDigest: inputs.inputDigest,
      getInputDigest: () => createCoverageProofInputs({ cwd, pool }).inputDigest,
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

  const coverageReport = collectCoverageAuditReport({
    root: cwd,
    reportPath: unitResult.reportPath,
  });
  if (coverageReport.error) {
    return withDuration(
      createFailureStep('Full product coverage', 'coverage report failed', {
        stderr: `${coverageReport.error}\n`,
      }),
      durationMs
    );
  }

  try {
    if (createCoverageProofInputs({ cwd, pool }).inputDigest !== inputs.inputDigest) {
      throw new Error('Coverage inputs changed before publication.');
    }
    writeCanonicalCoverageArtifacts({
      report: coverageReport,
      reportPath: unitResult.reportPath,
      root: cwd,
    });
    writeUnitAttemptEvidence(unitResult, path.join(cwd, CANONICAL_COVERAGE_DIRECTORY));
    recordSuccessfulCoverageProof({ cwd, inputs, pool });
    recordSuccessfulFullUnitProof({
      cwd,
      maxWorkers,
      pool,
      expectedInputDigest: inputs.fullUnit.inputDigest,
      source: 'full-product-coverage',
      suite: PRODUCT_QA_SUITE,
    });
  } catch (error) {
    return withDuration(
      createFailureStep('Full product coverage', 'coverage publication failed', {
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      }),
      durationMs
    );
  }

  return withDuration(
    {
      ...createOkStep(
        'Full product coverage',
        formatCoverageAuditReport(coverageReport) +
          (unitResult.passedOnAttempt2 ? '; passed on attempt 2' : '')
      ),
      stdout: unitResult.stdout,
      stderr: unitResult.stderr,
    },
    durationMs
  );
}
