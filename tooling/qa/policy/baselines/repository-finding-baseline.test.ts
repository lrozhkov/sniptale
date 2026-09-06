import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  applyRepositoryFindingBaseline,
  createRepositoryFindingBaseline,
} from './repository-finding-baseline.mjs';
import { createTempRoot } from '../../test-support/test-helpers';

function writeBaseline(root: string, findings: Array<Record<string, unknown>>) {
  const baselinePath = path.join(root, 'repository-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      createRepositoryFindingBaseline({
        acceptance: {
          id: 'noise.example.reviewed-fixture',
          classification: 'tool-noise',
          owner: 'qa-platform',
          reason: 'The fixture intentionally exercises exact baseline reconciliation.',
          removalCondition: 'Remove when the fixture finding disappears.',
        },
        controlId: 'qa.rule.example',
        findings,
      })
    )
  );
  return baselinePath;
}

it('keeps an exact repository baseline silent', () => {
  const root = createTempRoot('repository-baseline-match-');
  const findings = [{ rule: 'example', file: 'src/example.ts', line: 7, message: 'known' }];
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, findings),
    controlId: 'qa.rule.example',
    findings,
  });

  expect(result).toMatchObject({ matched: true, violations: [], advisories: [] });
});

it('blocks a net-new repository finding while preserving accepted findings', () => {
  const root = createTempRoot('repository-baseline-new-');
  const known = { rule: 'example', file: 'src/known.ts', line: 7, message: 'known' };
  const added = { rule: 'example', file: 'src/added.ts', line: 8, message: 'new' };
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, [known]),
    controlId: 'qa.rule.example',
    findings: [known, added],
  });

  expect(result.violations).toEqual([added]);
  expect(result.advisories).toEqual([]);
});

it('reports only disappeared accepted findings as non-blocking maintenance', () => {
  const root = createTempRoot('repository-baseline-stale-');
  const known = { rule: 'example', file: 'src/known.ts', line: 7, message: 'known' };
  const stale = { rule: 'example', file: 'src/stale.ts', line: 8, message: 'stale' };
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, [known, stale]),
    controlId: 'qa.rule.example',
    findings: [known],
  });

  expect(result.violations).toEqual([]);
  expect(result.advisories).toEqual([
    expect.objectContaining({
      rule: 'repository-baseline-stale',
      file: stale.file,
      message: expect.stringContaining('baseline cleanup is non-blocking'),
    }),
  ]);
});

it('treats a changed finding as net-new plus stale reviewed noise', () => {
  const root = createTempRoot('repository-baseline-changed-');
  const accepted = { rule: 'example', file: 'src/example.ts', line: 7, message: 'known' };
  const changed = { ...accepted, line: 8 };
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, [accepted]),
    controlId: 'qa.rule.example',
    findings: [changed],
  });

  expect(result.violations).toEqual([changed]);
  expect(result.advisories).toHaveLength(1);
});

it('preserves duplicate finding occurrence counts', () => {
  const root = createTempRoot('repository-baseline-duplicates-');
  const finding = { rule: 'example', file: 'src/example.ts', message: 'duplicate' };
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, [finding]),
    controlId: 'qa.rule.example',
    findings: [finding, finding],
  });

  expect(result.violations).toEqual([finding]);
  expect(result.advisories).toEqual([]);
});

it('supports stable finding keys with an explicit regression predicate', () => {
  const root = createTempRoot('repository-baseline-regression-');
  const accepted = { id: 'stable-id', rule: 'risk', file: 'src/example.ts', line: 7, score: 4 };
  const moved = { ...accepted, line: 20 };
  const regressed = { ...moved, score: 5 };
  const options = {
    baselinePath: writeBaseline(root, [accepted]),
    controlId: 'qa.rule.example',
    findingKey: (finding: Record<string, unknown>) => finding.id,
    isAcceptedFinding: (
      current: Record<string, unknown>,
      baselineFinding: Record<string, unknown>
    ) => Number(current.score) <= Number(baselineFinding.score),
  };

  expect(applyRepositoryFindingBaseline({ ...options, findings: [moved] })).toMatchObject({
    violations: [],
    advisories: [],
  });
  expect(applyRepositoryFindingBaseline({ ...options, findings: [regressed] })).toMatchObject({
    violations: [regressed],
    advisories: [],
  });
});

it('rejects accepted debt and unexplained repository baseline entries', () => {
  const root = createTempRoot('repository-baseline-noise-policy-');
  const finding = { rule: 'example', file: 'src/example.ts', message: 'review me' };
  const baselinePath = writeBaseline(root, [finding]);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  baseline.rationales[0].classification = 'accepted-debt';
  fs.writeFileSync(baselinePath, JSON.stringify(baseline));
  expect(() =>
    applyRepositoryFindingBaseline({
      baselinePath,
      controlId: 'qa.rule.example',
      findings: [finding],
    })
  ).toThrow('Malformed repository finding baseline');

  baseline.rationales[0].classification = 'tool-noise';
  delete baseline.rationales[0].reason;
  fs.writeFileSync(baselinePath, JSON.stringify(baseline));
  expect(() =>
    applyRepositoryFindingBaseline({
      baselinePath,
      controlId: 'qa.rule.example',
      findings: [finding],
    })
  ).toThrow('Malformed repository finding baseline');
});
