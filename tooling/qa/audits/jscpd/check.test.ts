import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { normalizeJscpdClones } from './jscpd-detector.mjs';
import { createTempRoot } from '../../test-support/test-helpers';

function endpoint(name: string, start: number, end: number) {
  return {
    name,
    start,
    end,
    startLoc: { line: start, column: 2, position: start * 10 },
    endLoc: { line: end, column: 1, position: end * 10 },
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

function duplicate(first = 'apps/a.ts', second = 'apps/b.ts') {
  return {
    format: 'typescript',
    lines: 8,
    tokens: 64,
    firstFile: endpoint(first, 10, 17),
    secondFile: endpoint(second, 20, 27),
  };
}

it('parses a complete jscpd v5 report and preserves the logical result id', async () => {
  const module = await import('./check.mjs');
  const root = createTempRoot('verify-jscpd-');
  const reportPath = path.join(root, 'jscpd-report.json');
  const result = module.runJscpdCheck({
    baselinePath: null,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: () => {
      fs.writeFileSync(reportPath, JSON.stringify(report([duplicate()])));
      return { status: 1, stdout: '', stderr: '' };
    },
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'jscpd-duplicate', file: expect.any(String) }),
  ]);
  expect(result.findings).toEqual([
    expect.objectContaining({
      format: 'typescript',
      lines: 8,
      tokens: 64,
      id: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }),
  ]);
  expect(result.summaryText).toContain('1 clone(s) / 8 duplicated lines');
});

it('fails when jscpd does not write a fresh report', async () => {
  const module = await import('./check.mjs');
  const root = createTempRoot('verify-jscpd-missing-report-');
  const reportPath = path.join(root, 'jscpd-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report([])));
  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath,
      runCommandImpl: () => ({ status: 0, stdout: '', stderr: '' }),
    })
  ).toThrow(`jscpd report ${reportPath} is required and must contain JSON`);
});

it('canonicalizes root order, separators, and clone endpoint direction', () => {
  const root = createTempRoot('verify-jscpd-normalize-');
  const left = path.join(root, 'apps', 'a.ts');
  const right = path.join(root, 'packages', 'b.ts').replaceAll('/', '\\');
  const original = duplicate(left, right);
  const forward = normalizeJscpdClones([original], { root });
  const reverse = normalizeJscpdClones(
    [{ ...original, firstFile: original.secondFile, secondFile: original.firstFile }],
    { root }
  );
  expect(reverse).toEqual(forward);
  expect(forward[0]?.firstFile.path).toBe('apps/a.ts');
  expect(forward[0]?.secondFile.path).toBe('packages/b.ts');
});

it('keeps same-file clones distinct by exact ranges', () => {
  const first = duplicate('apps/a.ts', 'apps/a.ts');
  const second = {
    ...first,
    secondFile: endpoint('apps/a.ts', 30, 37),
  };
  const findings = normalizeJscpdClones([first, second], { root: process.cwd() });
  expect(findings).toHaveLength(2);
  expect(new Set(findings.map((entry) => entry.id)).size).toBe(2);
});

it('rejects incomplete and unknown v5 report shapes', async () => {
  const module = await import('./check.mjs');
  const reportPath = path.join(createTempRoot('verify-jscpd-schema-'), 'report.json');
  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath,
      runCommandImpl: () => {
        fs.writeFileSync(reportPath, JSON.stringify({ duplicates: [duplicate()] }));
        return { status: 1, stdout: '', stderr: '' };
      },
    })
  ).toThrow('complete statistics');
});
