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
      ...matrix.allowedSkipped.map((stepId) => ({
        stepId,
        outcome: 'skipped',
        skipReasonId: matrix.allowedSkippedReasons[stepId],
      })),
    ],
  };
}

it('requires base-owned fast and release control matrices while permitting declared exclusions', () => {
  const proof = createTrustedControlMatrix('proof');
  const release = createTrustedControlMatrix('release');
  expect(proof.requiredPassed).toEqual(
    expect.arrayContaining([
      'qa.rule.typecheck',
      'qa.rule.osv-scanner',
      'qa.rule.gitleaks',
      'qa.rule.unit-tests',
    ])
  );
  expect(proof.requiredPassed).not.toContain('qa.rule.build');
  expect(proof.requiredPassed).not.toContain('qa.rule.release-archive');
  expect(proof.allowedSkipped).toEqual(
    expect.arrayContaining([
      'qa.rule.parser-snapshot-purity',
      'qa.rule.codeql',
      'qa.rule.full-product-coverage',
      'qa.rule.npm-audit',
    ])
  );
  expect(release.requiredPassed).toEqual(
    expect.arrayContaining([
      'qa.rule.sonarjs',
      'qa.rule.build',
      'qa.rule.release-archive',
      'qa.rule.codeql',
      'qa.rule.full-product-coverage',
      'qa.rule.npm-audit',
      'qa.rule.mutation-persistence',
      'qa.rule.mutation-secrets',
    ])
  );
  expect(release.requiredPassed).not.toContain('qa.rule.unit-tests');
  for (const id of [
    'qa.rule.changed-line-readability',
    'qa.rule.structural-risk',
    'qa.rule.ui-automation-seams',
  ]) {
    expect(proof.requiredPassed).not.toContain(id);
    expect(proof.allowedSkipped).not.toContain(id);
    expect(release.requiredPassed).not.toContain(id);
    expect(release.allowedSkipped).not.toContain(id);
  }
  expect(() => validateTrustedControlResults(recordFor('proof'), 'proof')).not.toThrow();
  expect(() => validateTrustedControlResults(recordFor('release'), 'release')).not.toThrow();
});

it('rejects missing, skipped, failed, or duplicated mandatory candidate results', () => {
  const missing = recordFor('proof');
  missing.steps = missing.steps.filter(({ stepId }) => stepId !== 'qa.rule.osv-scanner');
  expect(() => validateTrustedControlResults(missing, 'proof')).toThrow(
    'did not pass mandatory trusted control: qa.rule.osv-scanner'
  );
  const skipped = recordFor('proof');
  skipped.steps.find(({ stepId }) => stepId === 'qa.rule.unit-tests')!.outcome = 'skipped';
  expect(() => validateTrustedControlResults(skipped, 'proof')).toThrow(
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
  duplicated.steps.push({ stepId: 'qa.rule.osv-scanner', outcome: 'passed' });
  expect(() => validateTrustedControlResults(duplicated, 'proof')).toThrow(
    'repeats a trusted control result: qa.rule.osv-scanner'
  );
});

it('accepts only the declared reason for a commit-inapplicable control', () => {
  const valid = recordFor('proof');
  expect(() => validateTrustedControlResults(valid, 'proof')).not.toThrow();
  const parser = valid.steps.find(({ stepId }) => stepId === 'qa.rule.parser-snapshot-purity')!;
  parser.skipReasonId = 'audit.profile-not-selected';
  expect(() => validateTrustedControlResults(valid, 'proof')).toThrow(
    'inadmissible skip reason for trusted control: qa.rule.parser-snapshot-purity'
  );
});
