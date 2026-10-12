import {
  readVerifiedCoverageReport,
  resolveReusableCoverageProof,
} from '../../../proof/coverage/coverage-proof.mjs';
import { runTestCoverageCheck } from '../../../proof/coverage/test-coverage/check.mjs';
import { resolveProductUnitTestPool } from '../../../proof/unit/verify-unit-tests.mjs';
import { createFailureStep, createOkStep, createViolationStep } from '../focused-qa-results.mjs';
import { timeSyncStep } from '../../../runtime/observability/step-timing.helpers.mjs';

export function createReusableFullProofSteps({ codeFiles, pool }) {
  let reusable;
  try {
    reusable = resolveReusableCoverageProof({
      pool: pool ?? resolveProductUnitTestPool() ?? 'threads',
    });
  } catch {
    return null;
  }
  if (!reusable.matched) return null;
  const provenance = [
    `reused verified ${reusable.source}`,
    `full product coverage proof=${reusable.proof.proofDigest}`,
  ].join('; ');
  return [
    timeSyncStep(() => createOkStep('Unit tests', provenance)),
    timeSyncStep(() => {
      try {
        const coverageReportText = readVerifiedCoverageReport(reusable);
        const result = runTestCoverageCheck({ files: codeFiles, coverageReportText });
        if (result.error)
          return createFailureStep('Test coverage', 'failed', { stderr: result.error });
        return {
          ...createViolationStep(
            'Test coverage',
            'Diff-based test coverage violations found:',
            result
          ),
          detail: `${provenance}; current changed-file thresholds checked`,
        };
      } catch (error) {
        return createFailureStep('Test coverage', 'verified coverage report failed', {
          stderr: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  ];
}
