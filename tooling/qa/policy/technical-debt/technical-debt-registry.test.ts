import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  collectTechnicalDebtLinkViolations,
  collectTechnicalDebtRegistryViolations,
  TECHNICAL_DEBT_REGISTRY_PATH,
} from './technical-debt-registry.mjs';
import {
  generateTechnicalDebtReport,
  verifyTechnicalDebtReport,
} from './technical-debt-report.mjs';

type Registry = {
  schemaVersion: number;
  entries: Array<Record<string, any>>;
  [key: string]: unknown;
};

function readRegistry(): Registry {
  return JSON.parse(fs.readFileSync(TECHNICAL_DEBT_REGISTRY_PATH, 'utf8'));
}

function rulesFor(registry: Registry) {
  return collectTechnicalDebtRegistryViolations({ registry }).map((violation) => violation.rule);
}

describe('technical debt registry smell contract', () => {
  it('accepts the compact live registry and generated human projection', () => {
    const registry = readRegistry();
    expect(Object.keys(registry).sort()).toEqual(['entries', 'schemaVersion']);
    expect(collectTechnicalDebtRegistryViolations()).toEqual([]);
    expect(verifyTechnicalDebtReport()).toEqual([]);
    expect(fs.readFileSync('docs/engineering/tech-debt-report.md', 'utf8')).toBe(
      generateTechnicalDebtReport()
    );
  });

  it('rejects top-level and entry schema expansion', () => {
    const topLevelExpansion = readRegistry();
    topLevelExpansion.unrelatedInventory = [];
    expect(rulesFor(topLevelExpansion)).toContain('technical-debt-schema');

    const entryExpansion = readRegistry();
    entryExpansion.entries[0].unrelatedInventory = [];
    expect(rulesFor(entryExpansion)).toContain('technical-debt-entry-shape');

    const sourceExpansion = readRegistry();
    sourceExpansion.entries[0].source.label = 'duplicate authority';
    expect(rulesFor(sourceExpansion)).toContain('technical-debt-source');
  });

  it('rejects invalid dates, mismatched classifications, and duplicate identities', () => {
    const impossibleDate = readRegistry();
    impossibleDate.entries[0].reviewBy = '2027-02-30';
    expect(rulesFor(impossibleDate)).toContain('technical-debt-review-date');

    const prefixMismatch = readRegistry();
    prefixMismatch.entries[0].classification = 'debt';
    expect(rulesFor(prefixMismatch)).toContain('technical-debt-id-classification');

    const duplicateId = readRegistry();
    duplicateId.entries[1].id = duplicateId.entries[0].id;
    expect(rulesFor(duplicateId)).toContain('technical-debt-duplicate-id');

    const duplicateSource = readRegistry();
    duplicateSource.entries[1].source = structuredClone(duplicateSource.entries[0].source);
    expect(rulesFor(duplicateSource)).toContain('technical-debt-duplicate-source');
  });

  it('rejects stale records and widened enforced-source scopes', () => {
    const missingLink = readRegistry();
    missingLink.entries = missingLink.entries.filter(
      (entry) => entry.id !== 'accepted.license.eslint-plugin-sonarjs'
    );
    expect(rulesFor(missingLink)).toContain('technical-debt-missing-link');

    const scopeDrift = readRegistry();
    const license = scopeDrift.entries.find(
      (entry) => entry.id === 'accepted.license.eslint-plugin-sonarjs'
    );
    license.scope.resolvedVersion = '4.0.4';
    expect(rulesFor(scopeDrift)).toContain('technical-debt-scope-drift');

    const staleRecord = readRegistry();
    staleRecord.entries.push({
      ...structuredClone(staleRecord.entries[0]),
      id: 'accepted.license.unreferenced',
      source: { kind: 'license', key: 'unreferenced' },
    });
    expect(rulesFor(staleRecord)).toContain('technical-debt-unreferenced-entry');
  });

  it('preserves live SCC classifications and rejects classification or exact graph scope drift', () => {
    const source = JSON.parse(
      fs.readFileSync(
        'tooling/qa/guards/architecture/architecture-guardrails/scc-registry.data.json',
        'utf8'
      )
    );
    const registry = readRegistry();
    expect(collectTechnicalDebtRegistryViolations({ registry })).toEqual([]);
    for (const composition of source) {
      const classification =
        composition.classification === 'tool-noise'
          ? 'tool-noise'
          : composition.reason.startsWith('Allowed composition:')
            ? 'accepted-architecture'
            : 'debt';
      const linked = registry.entries.find((entry) => entry.id === composition.debtId)!;
      expect(linked).toBeDefined();
      expect(linked.classification).toBe(classification);
      for (const patch of [
        { classification: classification === 'debt' ? 'tool-noise' : 'debt' },
        { scope: { ...linked.scope, edgeDigest: '0'.repeat(64) } },
        { scope: { ...linked.scope, owners: [...linked.scope.owners, 'unreviewed-owner'] } },
      ]) {
        const invalid = structuredClone(registry);
        Object.assign(
          invalid.entries.find((entry) => entry.id === linked.id)!,
          patch
        );
        expect(rulesFor(invalid)).toContain('technical-debt-scope-drift');
      }
    }
  });

  it('validates a direct external-baseline link without inventory coupling', () => {
    const registry = readRegistry();
    const entry = registry.entries[0];
    expect(
      collectTechnicalDebtLinkViolations({
        links: [
          {
            classification: entry.classification,
            debtId: entry.id,
            file: 'synthetic-baseline.json',
            scope: entry.scope,
            sourceKey: entry.source.key,
            sourceKind: entry.source.kind,
          },
        ],
      })
    ).toEqual([]);
  });
});
