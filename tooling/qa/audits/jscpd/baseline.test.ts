import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { runJscpdCheck } from './check.mjs';
import { summarizeJscpdFamilies } from './jscpd-baseline-contract.mjs';
import { normalizeJscpdClones } from './jscpd-detector.mjs';
import { createTempRoot } from '../../test-support/test-helpers';

function endpoint(name: string, start: number, end: number) {
  return {
    name,
    start,
    end,
    startLoc: { line: start, column: 0, position: start * 10 },
    endLoc: { line: end, column: 1, position: end * 10 },
  };
}

function duplicate() {
  return {
    format: 'typescript',
    lines: 8,
    tokens: 64,
    firstFile: endpoint('apps/extension/src/editor/controller/a.ts', 10, 17),
    secondFile: endpoint('apps/extension/src/editor/controller/b.ts', 20, 27),
  };
}

function report(duplicates: unknown[]) {
  return {
    duplicates,
    statistics: {
      formats: { typescript: { sources: 2, clones: duplicates.length } },
      total: { sources: 2, clones: duplicates.length },
    },
  };
}

function runFixture({ stale = false } = {}) {
  const root = createTempRoot('verify-jscpd-baseline-');
  const reportPath = path.join(root, 'report.json');
  const baselinePath = path.join(root, 'baseline.json');
  const family = summarizeJscpdFamilies(normalizeJscpdClones([duplicate()], { root }))[0];
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      version: 3,
      families: [
        stale
          ? { ...family, family: 'apps/extension/src/retired/owner' }
          : { ...family, debtId: 'accepted.jscpd.fixture' },
      ],
    })
  );
  return runJscpdCheck({
    baselinePath,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: () => {
      fs.writeFileSync(reportPath, JSON.stringify(report([duplicate()])));
      return { status: 1, stdout: '', stderr: '' };
    },
  });
}

it('admits the exact current clone family through the checked-in baseline contract', () => {
  const result = runFixture();
  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('1 clone(s) / 8 duplicated lines');
});

it('blocks a changed and stale clone-family population', () => {
  const result = runFixture({ stale: true });
  expect(result.violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'jscpd-baseline-growth' }),
      expect.objectContaining({ rule: 'jscpd-baseline-stale' }),
    ])
  );
});
