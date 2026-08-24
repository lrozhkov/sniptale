import { expect, it } from 'vitest';

import {
  createTrustedControlMatrix,
  validateTrustedControlResults,
} from './trusted-control-matrix.mjs';

function recordFor(lane: 'proof' | 'release') {
  const matrix = createTrustedControlMatrix(lane);
  return {
    steps: [
      ...matrix.requiredPassed.map((stepId) => ({ stepId, outcome: 'passed' })),
      ...matrix.allowedSkipped.map((stepId) => ({ stepId, outcome: 'skipped' })),
    ],
  };
}

it('requires base-owned fast and release control matrices while permitting declared exclusions', () => {
  const proof = createTrustedControlMatrix('proof');
  const release = createTrustedControlMatrix('release');
  expect(proof.requiredPassed).toEqual(
    expect.arrayContaining([
      'qa.rule.typecheck',
      'qa.rule.release-archive',
      'qa.rule.semgrep',
      'qa.rule.gitleaks',
    ])
  );
  expect(proof.allowedSkipped).toEqual(
    expect.arrayContaining([
      'qa.rule.unit-tests',
      'qa.rule.test-coverage',
      'qa.rule.codeql',
      'qa.rule.full-product-coverage',
    ])
  );
  expect(release.requiredPassed).toEqual(
    expect.arrayContaining([
      'qa.rule.unit-tests',
      'qa.rule.codeql',
      'qa.rule.full-product-coverage',
      'qa.rule.mutation-persistence',
      'qa.rule.mutation-secrets',
    ])
  );
  expect(release.allowedSkipped).toContain('qa.rule.test-coverage');
  expect(release.requiredPassed).not.toContain('qa.rule.test-coverage');
  expect(() => validateTrustedControlResults(recordFor('proof'), 'proof')).not.toThrow();
  expect(() => validateTrustedControlResults(recordFor('release'), 'release')).not.toThrow();
});

it('rejects missing, skipped, failed, or duplicated mandatory candidate results', () => {
  const missing = recordFor('proof');
  missing.steps = missing.steps.filter(({ stepId }) => stepId !== 'qa.rule.semgrep');
  expect(() => validateTrustedControlResults(missing, 'proof')).toThrow(
    'did not pass mandatory trusted control: qa.rule.semgrep'
  );
  const skipped = recordFor('release');
  skipped.steps.find(({ stepId }) => stepId === 'qa.rule.unit-tests')!.outcome = 'skipped';
  expect(() => validateTrustedControlResults(skipped, 'release')).toThrow(
    'did not pass mandatory trusted control: qa.rule.unit-tests'
  );
  const skippedCoverageAudit = recordFor('release');
  skippedCoverageAudit.steps.find(
    ({ stepId }) => stepId === 'qa.rule.full-product-coverage'
  )!.outcome = 'skipped';
  expect(() => validateTrustedControlResults(skippedCoverageAudit, 'release')).toThrow(
    'did not pass mandatory trusted control: qa.rule.full-product-coverage'
  );
  const duplicated = recordFor('proof');
  duplicated.steps.push({ stepId: 'qa.rule.semgrep', outcome: 'passed' });
  expect(() => validateTrustedControlResults(duplicated, 'proof')).toThrow(
    'repeats a trusted control result: qa.rule.semgrep'
  );
});
