import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../../test-support/test-helpers';
import { applyGitleaksBaseline, GITLEAKS_NORMALIZATION_SCHEMA } from './gitleaks-baseline.mjs';

function baselineFinding(overrides: Record<string, unknown> = {}) {
  const commit = 'a'.repeat(40);
  return {
    RuleID: 'generic-api-key',
    File: 'src/fixture.ts',
    StartLine: 7,
    Commit: commit,
    Fingerprint: `${commit}:src/fixture.ts:generic-api-key:7`,
    SniptaleDebtId: 'noise.gitleaks.fixture',
    SniptaleScope: 'history',
    ...overrides,
  };
}

function writeBaseline(findings: unknown[], envelope: Record<string, unknown> = {}) {
  const root = createTempRoot('gitleaks-baseline-contract-');
  const baselinePath = path.join(root, 'baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      schemaVersion: 1,
      normalizationSchemaVersion: GITLEAKS_NORMALIZATION_SCHEMA,
      findings,
      ...envelope,
    })
  );
  return baselinePath;
}

it('matches all ten live immutable-history debt links non-vacuously', () => {
  const baseline = JSON.parse(fs.readFileSync('tooling/configs/qa/gitleaks-baseline.json', 'utf8'));
  const findings = baseline.findings.map((finding: Record<string, unknown>) => ({
    RuleID: finding.RuleID,
    Description: 'reviewed history finding',
    File: finding.File,
    StartLine: finding.StartLine,
    Commit: finding.Commit,
    Fingerprint: finding.Fingerprint,
  }));
  const result = applyGitleaksBaseline({
    baselinePath: 'tooling/configs/qa/gitleaks-baseline.json',
    scopedFindings: [{ scope: 'history', findings }],
    scopes: ['history'],
  });
  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('10/10 matched');
});

it('never applies a history baseline tuple to a worktree finding', () => {
  const finding = baselineFinding();
  const baselinePath = writeBaseline([finding]);
  const result = applyGitleaksBaseline({
    baselinePath,
    scopedFindings: [
      {
        scope: 'worktree',
        findings: [
          {
            RuleID: finding.RuleID,
            Description: 'live secret',
            File: finding.File,
            StartLine: finding.StartLine,
            Fingerprint: finding.Fingerprint,
          },
        ],
      },
    ],
    scopes: ['worktree'],
    validateDebtLinks: false,
  });
  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'generic-api-key', file: 'src/fixture.ts' }),
  ]);
});

it.each([
  ['empty rule', [baselineFinding({ RuleID: '' })]],
  ['non-positive line', [baselineFinding({ StartLine: 0 })]],
  ['absolute path', [baselineFinding({ File: '/tmp/fixture.ts' })]],
  ['extra field', [baselineFinding({ Extra: true })]],
  [
    'duplicate debt claim',
    [
      baselineFinding(),
      baselineFinding({
        Commit: 'b'.repeat(40),
        Fingerprint: `${'b'.repeat(40)}:src/fixture.ts:generic-api-key:7`,
      }),
    ],
  ],
] as const)('rejects %s baseline metadata', (_label, findings) => {
  expect(() =>
    applyGitleaksBaseline({
      baselinePath: writeBaseline(findings),
      scopedFindings: [],
      scopes: ['worktree'],
      validateDebtLinks: false,
    })
  ).toThrow();
});

it('rejects an unknown versioned baseline schema', () => {
  expect(() =>
    applyGitleaksBaseline({
      baselinePath: writeBaseline([], { schemaVersion: 2 }),
      scopedFindings: [],
      scopes: ['worktree'],
      validateDebtLinks: false,
    })
  ).toThrow('exact versioned history schema');
});
