import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  applyRepositoryFindingBaseline,
  createRepositoryFindingDigest,
} from './repository-finding-baseline.mjs';
import { createTempRoot } from '../../test-support/test-helpers';

function writeBaseline(root: string, findings: Array<Record<string, unknown>>) {
  const baselinePath = path.join(root, 'repository-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      schemaVersion: 1,
      controlId: 'qa.rule.example',
      findingCount: findings.length,
      findingDigest: createRepositoryFindingDigest(findings),
    })
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

it('reports aggregate repository snapshot drift without blocking release', () => {
  const root = createTempRoot('repository-baseline-drift-');
  const accepted = [{ rule: 'example', file: 'src/example.ts', line: 7, message: 'known' }];
  const observed = [{ rule: 'example', file: 'src/example.ts', line: 8, message: 'moved' }];
  const result = applyRepositoryFindingBaseline({
    baselinePath: writeBaseline(root, accepted),
    controlId: 'qa.rule.example',
    findings: observed,
  });

  expect(result.violations).toEqual([]);
  expect(result.advisories).toEqual([
    expect.objectContaining({
      rule: 'repository-baseline-drift',
      message: expect.stringContaining('Baseline maintenance is non-blocking'),
    }),
  ]);
});
