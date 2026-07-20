import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  collectTechnicalDebtRegistryViolations,
  TECHNICAL_DEBT_REGISTRY_PATH,
} from './technical-debt-registry.mjs';
import {
  generateTechnicalDebtReport,
  verifyTechnicalDebtReport,
} from './technical-debt-report.mjs';
import {
  collectCoverageOwnerViolations,
  synchronizeCoverageOwnerInventory,
} from './technical-debt-coverage.mjs';

function readRegistry() {
  return JSON.parse(fs.readFileSync(TECHNICAL_DEBT_REGISTRY_PATH, 'utf8'));
}

function rulesFor(registry: object) {
  return collectTechnicalDebtRegistryViolations({ registry }).map((violation) => violation.rule);
}

const OBSERVED_COVERAGE_FAMILY = {
  owner: 'apps/extension/src/features/example',
  productionFiles: [
    'apps/extension/src/features/example/a.ts',
    'apps/extension/src/features/example/b.ts',
  ],
  rolloutFiles: ['apps/extension/src/features/example/a.ts'],
  unownedFocusedFiles: ['apps/extension/src/features/example/a.ts'],
  observedDisposition: 'partial',
};
const COVERAGE_FAMILY_DISPOSITION = {
  ...OBSERVED_COVERAGE_FAMILY,
  disposition: 'partial',
  reason: 'Exact example owner-family disposition.',
};

function coverageRules(coverageOwners: object[], inventory = [OBSERVED_COVERAGE_FAMILY]) {
  return collectCoverageOwnerViolations(coverageOwners, { inventory }).map(
    (violation) => violation.rule
  );
}

describe('technical debt registry', () => {
  it('matches every enforced source, coverage owner, policy surface, and generated report', () => {
    expect(collectTechnicalDebtRegistryViolations()).toEqual([]);
    expect(verifyTechnicalDebtReport()).toEqual([]);
    expect(fs.readFileSync('docs/engineering/tech-debt-report.md', 'utf8')).toBe(
      generateTechnicalDebtReport()
    );
  });

  it('rejects duplicate, expired, and unlinked debt records', () => {
    const duplicate = readRegistry();
    duplicate.entries[1].id = duplicate.entries[0].id;
    expect(rulesFor(duplicate)).toContain('technical-debt-duplicate-id');

    const expired = readRegistry();
    expired.entries[0].reviewBy = '2020-01-01';
    expect(rulesFor(expired)).toContain('technical-debt-review-date');

    const unlinked = readRegistry();
    unlinked.entries = unlinked.entries.filter(
      (entry: { id: string }) => entry.id !== 'accepted.license.eslint-plugin-sonarjs'
    );
    expect(rulesFor(unlinked)).toContain('technical-debt-missing-link');
  });
});

describe('technical debt registry policy alignment', () => {
  it('rejects widened scopes and new coverage owners without disposition', () => {
    const scopeDrift = readRegistry();
    const license = scopeDrift.entries.find(
      (entry: { id: string }) => entry.id === 'accepted.license.eslint-plugin-sonarjs'
    );
    license.scope.resolvedVersion = '4.0.4';
    expect(rulesFor(scopeDrift)).toContain('technical-debt-scope-drift');

    const coverageGap = readRegistry();
    coverageGap.coverageOwners.shift();
    expect(rulesFor(coverageGap)).toContain('coverage-owner-unmapped');
  });

  it('rejects policy source drift, missing surfaces, and duplicate claims', () => {
    const policyDrift = readRegistry();
    policyDrift.policyDispositions[0].exactSource.contentHash = '0'.repeat(64);
    expect(rulesFor(policyDrift)).toContain('policy-disposition-drift');

    const missingPolicy = readRegistry();
    missingPolicy.policyDispositions = missingPolicy.policyDispositions.filter(
      (entry: { id: string }) => entry.id !== 'policy.logging-owner-files'
    );
    expect(rulesFor(missingPolicy)).toContain('policy-disposition-missing');

    const duplicatePolicySurface = readRegistry();
    const loggingPolicy = duplicatePolicySurface.policyDispositions.find(
      (entry: { id: string }) => entry.id === 'policy.logging-owner-files'
    );
    duplicatePolicySurface.policyDispositions.push({
      ...loggingPolicy,
      id: 'policy.untracked-exception',
    });
    expect(rulesFor(duplicatePolicySurface)).toContain('policy-disposition-surface-duplicate');
  });
});

describe('coverage owner synchronization', () => {
  it('synchronizes file inventories only after owners and dispositions are approved', () => {
    expect(
      synchronizeCoverageOwnerInventory([COVERAGE_FAMILY_DISPOSITION], {
        inventory: [OBSERVED_COVERAGE_FAMILY],
      })
    ).toEqual([
      {
        disposition: 'partial',
        owner: OBSERVED_COVERAGE_FAMILY.owner,
        productionFiles: OBSERVED_COVERAGE_FAMILY.productionFiles,
        reason: COVERAGE_FAMILY_DISPOSITION.reason,
        rolloutFiles: OBSERVED_COVERAGE_FAMILY.rolloutFiles,
        unownedFocusedFiles: OBSERVED_COVERAGE_FAMILY.unownedFocusedFiles,
      },
    ]);
    expect(() =>
      synchronizeCoverageOwnerInventory([], { inventory: [OBSERVED_COVERAGE_FAMILY] })
    ).toThrow('explicit dispositions');
    expect(() =>
      synchronizeCoverageOwnerInventory(
        [{ ...COVERAGE_FAMILY_DISPOSITION, disposition: 'rollout' }],
        { inventory: [OBSERVED_COVERAGE_FAMILY] }
      )
    ).toThrow('approved disposition');
  });
});

describe('coverage owner exact populations', () => {
  it('rejects same-count substitution and exact-set contraction', () => {
    const productionSubstitution = {
      ...COVERAGE_FAMILY_DISPOSITION,
      productionFiles: [
        'apps/extension/src/features/example/a.ts',
        'apps/extension/src/features/example/substituted.ts',
      ],
    };
    expect(coverageRules([productionSubstitution])).toContain('coverage-owner-production-drift');

    const productionContraction = {
      ...COVERAGE_FAMILY_DISPOSITION,
      productionFiles: ['apps/extension/src/features/example/a.ts'],
    };
    expect(coverageRules([productionContraction])).toContain('coverage-owner-production-drift');

    const rolloutContraction = { ...COVERAGE_FAMILY_DISPOSITION, rolloutFiles: [] };
    expect(coverageRules([rolloutContraction])).toContain('coverage-owner-rollout-drift');

    const unownedSubstitution = {
      ...COVERAGE_FAMILY_DISPOSITION,
      unownedFocusedFiles: ['apps/extension/src/features/example/substituted.ts'],
    };
    expect(coverageRules([unownedSubstitution])).toContain('coverage-owner-unowned-drift');
  });

  it('rejects new and stale owner families bidirectionally', () => {
    const substitutedFamily = {
      ...COVERAGE_FAMILY_DISPOSITION,
      owner: 'apps/extension/src/features/substituted',
    };
    expect(coverageRules([substitutedFamily])).toEqual(
      expect.arrayContaining(['coverage-owner-unmapped', 'coverage-owner-stale'])
    );
  });
});
