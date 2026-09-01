import { expect, it } from 'vitest';

import {
  createTrustedControlMatrix,
  validateTrustedControlResults,
} from './trusted-control-matrix.mjs';
import { expectedProofPopulationKind } from './proof-population-policy.mjs';

function populationFor(stepId: string) {
  const populationKind = expectedProofPopulationKind(stepId);
  return populationKind === 'repository-files'
    ? { scope: 'repo-wide', populationKind, scannedFileCount: 1 }
    : { scope: 'repo-wide', populationKind };
}

function recordFor(lane: 'proof' | 'release') {
  const matrix = createTrustedControlMatrix(lane);
  const admission = {
    proofSemanticDigest: `sha256:${'1'.repeat(64)}`,
    proofManifestDigest: `sha256:${'2'.repeat(64)}`,
    sourceRunRecord: '.tmp/qa-observability/runs/proof.json',
    sourceRunLog: '.tmp/qa-logs/proof.log',
  };
  return {
    admission,
    steps: [
      ...matrix.requiredPassed.map((stepId) => ({
        stepId,
        outcome: 'passed',
        population: populationFor(stepId),
      })),
      ...matrix.requiredInherited.map((stepId) => ({
        stepId,
        outcome: 'inherited',
        inheritance: {
          sourceProofSemanticDigest: admission.proofSemanticDigest,
          sourceProofManifestDigest: admission.proofManifestDigest,
          sourceControlId: stepId,
          sourceRunRecord: `fast-proof/${admission.sourceRunRecord}`,
          evidenceFiles: [
            `fast-proof/${admission.sourceRunRecord}`,
            `fast-proof/${admission.sourceRunLog}`,
          ],
        },
      })),
      ...matrix.allowedSkipped.map((stepId) => ({
        stepId,
        outcome: 'skipped',
        skipReasonId: matrix.allowedSkippedReasons[stepId],
      })),
    ],
  };
}

function validate(record: ReturnType<typeof recordFor>, lane: 'proof' | 'release') {
  return validateTrustedControlResults(record, lane, process.cwd(), {
    admission: record.admission,
    sourceRecord: {
      steps: createTrustedControlMatrix(lane).requiredInherited.map((stepId) => ({
        stepId,
        outcome: 'passed',
        population: populationFor(stepId),
      })),
    },
  });
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
  expect(proof.allowedSkipped).toEqual(expect.arrayContaining(['qa.rule.codeql']));
  expect(release.requiredPassed).toEqual(
    expect.arrayContaining([
      'qa.rule.build',
      'qa.rule.release-archive',
      'qa.rule.codeql',
      'qa.rule.npm-audit',
    ])
  );
  expect(release.requiredInherited).toEqual(
    expect.arrayContaining([
      'qa.rule.sonarjs',
      'qa.rule.full-product-coverage',
      'qa.rule.production-build',
    ])
  );
  expect(release.requiredPassed).not.toContain('qa.rule.unit-tests');
  for (const id of ['qa.rule.changed-line-readability']) {
    expect(proof.requiredPassed).not.toContain(id);
    expect(proof.allowedSkipped).not.toContain(id);
    expect(release.requiredPassed).not.toContain(id);
    expect(release.allowedSkipped).not.toContain(id);
  }
  for (const id of ['qa.rule.structural-risk', 'qa.rule.ui-automation-seams']) {
    expect(proof.requiredPassed).toContain(id);
    expect(release.requiredInherited).toContain(id);
  }
  expect(() => validate(recordFor('proof'), 'proof')).not.toThrow();
  expect(() => validate(recordFor('release'), 'release')).not.toThrow();
});

it('rejects missing, skipped, failed, or duplicated mandatory candidate results', () => {
  const missing = recordFor('proof');
  missing.steps = missing.steps.filter(({ stepId }) => stepId !== 'qa.rule.osv-scanner');
  expect(() => validate(missing, 'proof')).toThrow(
    'did not pass mandatory trusted control: qa.rule.osv-scanner'
  );
  const skipped = recordFor('proof');
  skipped.steps.find(({ stepId }) => stepId === 'qa.rule.unit-tests')!.outcome = 'skipped';
  expect(() => validate(skipped, 'proof')).toThrow(
    'did not pass mandatory trusted control: qa.rule.unit-tests'
  );
  const skippedCoverageAudit = recordFor('release');
  skippedCoverageAudit.steps.find(
    ({ stepId }) => stepId === 'qa.rule.full-product-coverage'
  )!.outcome = 'skipped';
  expect(() => validate(skippedCoverageAudit, 'release')).toThrow(
    'did not bind inherited trusted control: qa.rule.full-product-coverage'
  );
  const duplicated = recordFor('proof');
  duplicated.steps.push({ stepId: 'qa.rule.osv-scanner', outcome: 'passed' });
  expect(() => validate(duplicated, 'proof')).toThrow(
    'repeats a trusted control result: qa.rule.osv-scanner'
  );
});

it('requires formerly inapplicable parser controls after repo-wide activation', () => {
  const valid = recordFor('proof');
  expect(() => validate(valid, 'proof')).not.toThrow();
  const parser = valid.steps.find(({ stepId }) => stepId === 'qa.rule.parser-snapshot-purity')!;
  parser.outcome = 'skipped';
  parser.skipReasonId = 'no-applicable-targets';
  expect(() => validate(valid, 'proof')).toThrow(
    'did not pass mandatory trusted control: qa.rule.parser-snapshot-purity'
  );
});

it('rejects inherited status for fresh controls and mismatched inherited evidence', () => {
  const freshAsInherited = recordFor('release');
  freshAsInherited.steps.find(({ stepId }) => stepId === 'qa.rule.npm-audit')!.outcome =
    'inherited';
  expect(() => validate(freshAsInherited, 'release')).toThrow(
    'did not pass mandatory trusted control: qa.rule.npm-audit'
  );

  const mismatched = recordFor('release');
  const inherited = mismatched.steps.find(
    ({ stepId }) => stepId === 'qa.rule.full-product-coverage'
  )!;
  inherited.inheritance!.sourceProofSemanticDigest = `sha256:${'9'.repeat(64)}`;
  expect(() => validate(mismatched, 'release')).toThrow(
    'did not bind inherited trusted control: qa.rule.full-product-coverage'
  );
});

it('rejects a missing or empty mandatory repository-file population', () => {
  for (const population of [
    null,
    {
      scope: 'repo-wide',
      populationKind: 'repository-files',
      scannedFileCount: 0,
    },
  ]) {
    const record = recordFor('proof');
    record.steps.find(({ stepId }) => stepId === 'qa.rule.oxlint')!.population = population;
    expect(() => validate(record, 'proof')).toThrow(
      'invalid trusted control population: qa.rule.oxlint'
    );
  }
});
