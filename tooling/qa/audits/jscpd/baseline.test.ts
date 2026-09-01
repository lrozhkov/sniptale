import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { runJscpdCheck } from './check.mjs';
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

function allowanceFor(finding: ReturnType<typeof normalizeJscpdClones>[number]) {
  return {
    id: finding.id,
    classification: 'tool-noise',
    owner: 'fixture-owner',
    reason: 'The fixture models an intentional independent operation.',
    removalCondition: 'Remove when the independent operation no longer has matching tokens.',
    reviewBy: '2099-01-01',
    firstFile: {
      path: finding.firstFile.path,
      start: finding.firstFile.start,
      end: finding.firstFile.end,
    },
    secondFile: {
      path: finding.secondFile.path,
      start: finding.secondFile.start,
      end: finding.secondFile.end,
    },
  };
}

function runFixture({ allowances }: { allowances?: unknown[] } = {}) {
  const root = createTempRoot('verify-jscpd-baseline-');
  const reportPath = path.join(root, 'report.json');
  const baselinePath = path.join(root, 'baseline.json');
  const finding = normalizeJscpdClones([duplicate()], { root })[0]!;
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      version: 4,
      allowances: allowances ?? [allowanceFor(finding)],
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

it('admits an exact reviewed tool-noise finding', () => {
  const result = runFixture();
  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('1 clone(s) / 8 duplicated lines');
});

it('admits supplemental target action and serialization-independent endpoint keys', () => {
  const finding = normalizeJscpdClones([duplicate()], { root: process.cwd() })[0]!;
  const base = allowanceFor(finding);
  const allowance = {
    ...base,
    targetAction: 'Re-evaluate if both endpoints acquire one semantic owner.',
    firstFile: {
      end: base.firstFile.end,
      path: base.firstFile.path,
      start: base.firstFile.start,
    },
  };
  expect(runFixture({ allowances: [allowance] }).violations).toEqual([]);
});

it('blocks an unreviewed live finding and reports a stale allowance as advisory', () => {
  const finding = normalizeJscpdClones([duplicate()], { root: process.cwd() })[0]!;
  const stale = allowanceFor(finding);
  stale.id = 'a'.repeat(64);
  const result = runFixture({ allowances: [stale] });
  expect(result.violations).toEqual([expect.objectContaining({ rule: 'jscpd-unreviewed-clone' })]);
  expect(result.advisories).toEqual([expect.objectContaining({ rule: 'jscpd-baseline-stale' })]);
  expect(result.summaryText).toContain('advisories=1');
});

it('does not block a release when the only mismatch is an extra stale allowance', () => {
  const finding = normalizeJscpdClones([duplicate()], { root: process.cwd() })[0]!;
  const stale = { ...allowanceFor(finding), id: 'b'.repeat(64) };
  const result = runFixture({ allowances: [allowanceFor(finding), stale] });
  expect(result.violations).toEqual([]);
  expect(result.advisories).toEqual([expect.objectContaining({ rule: 'jscpd-baseline-stale' })]);
});

it('blocks endpoint drift and an expired review', () => {
  const root = process.cwd();
  const finding = normalizeJscpdClones([duplicate()], { root })[0]!;
  const allowance = allowanceFor(finding);
  allowance.firstFile.end += 1;
  allowance.reviewBy = '2020-01-01';
  const result = runFixture({ allowances: [allowance] });
  expect(result.violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'jscpd-baseline-identity-drift' }),
      expect.objectContaining({ rule: 'jscpd-baseline-review-expired' }),
    ])
  );
});

it.each([
  ['missing owner', (entry: Record<string, unknown>) => delete entry['owner']],
  ['wrong classification', (entry: Record<string, unknown>) => (entry['classification'] = 'debt')],
  ['missing reason', (entry: Record<string, unknown>) => delete entry['reason']],
  [
    'missing removal condition',
    (entry: Record<string, unknown>) => delete entry['removalCondition'],
  ],
  ['malformed review date', (entry: Record<string, unknown>) => (entry['reviewBy'] = 'soon')],
  ['empty target action', (entry: Record<string, unknown>) => (entry['targetAction'] = '  ')],
])('rejects malformed allowance metadata: %s', (_label, mutate) => {
  const finding = normalizeJscpdClones([duplicate()], { root: process.cwd() })[0]!;
  const allowance = allowanceFor(finding) as unknown as Record<string, unknown>;
  mutate(allowance);
  expect(() => runFixture({ allowances: [allowance] })).toThrow('malformed tool-noise');
});

it('rejects duplicate reviewed finding identities', () => {
  const finding = normalizeJscpdClones([duplicate()], { root: process.cwd() })[0]!;
  const allowance = allowanceFor(finding);
  expect(() => runFixture({ allowances: [allowance, allowance] })).toThrow('duplicate finding id');
});
