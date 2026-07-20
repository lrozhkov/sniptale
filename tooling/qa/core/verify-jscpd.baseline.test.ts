import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';

const sampleFingerprint = '5dbbf86f47e7e2b1db694e3d86e4229dfee46c0d8a81dd97ade5a4dbe5542c34';

function writeBaseline(root: string, family: Record<string, unknown>) {
  const baselinePath = path.join(root, 'jscpd-baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify({ families: [family] }));
  return baselinePath;
}

function writeDebtRegistry(
  root: string,
  family: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
) {
  const debtRegistryPath = path.join(root, 'technical-debt.data.json');
  fs.writeFileSync(
    debtRegistryPath,
    JSON.stringify({
      entries: [
        {
          id: family.debtId,
          classification: 'debt',
          owner: 'editor-controller',
          reason: 'Covered by an owner-lane cleanup plan.',
          targetAction: 'Extract duplicated controller action helpers.',
          acceptance: {
            criteria: ['Remove the exact measured duplicate family.'],
            negativeCases: ['Reject stale or replacement clone populations.'],
            nonGoals: ['Do not widen the owner seam.'],
          },
          source: { kind: 'jscpd', key: family.family },
          scope: {
            count: family.count,
            family: family.family,
            lines: family.lines,
            sampleFingerprint: family.sampleFingerprint,
          },
          ...overrides,
        },
      ],
    })
  );
  return debtRegistryPath;
}

function createBaselineFamily(overrides: Record<string, unknown> = {}) {
  return {
    debtId: 'debt.jscpd.editor-controller',
    family: 'apps/extension/src/editor/controller',
    count: 1,
    lines: 8,
    sampleFingerprint,
    ...overrides,
  };
}

function writeDuplicateReport(reportPath: string, firstFile = 'a.ts', secondFile = 'b.ts') {
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      duplicates: [
        {
          lines: 8,
          firstFile: {
            name: `apps/extension/src/editor/controller/${firstFile}`,
            start: 10,
          },
          secondFile: { name: `apps/extension/src/editor/controller/${secondFile}` },
        },
      ],
    })
  );
}

async function runBaselineCheck(
  root: string,
  family: Record<string, unknown>,
  writeReport: (reportPath: string) => number | void = writeDuplicateReport,
  registryOverrides: Record<string, unknown> = {}
) {
  const module = await import('../audits/jscpd.mjs');
  const reportPath = path.join(root, 'jscpd-report.json');
  const baselinePath = writeBaseline(root, family);
  const debtRegistryPath = writeDebtRegistry(root, family, registryOverrides);
  return module.runJscpdCheck({
    baselinePath,
    debtRegistryPath,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: () => {
      const status = writeReport(reportPath);
      return { status: status ?? 1, stdout: '', stderr: '' };
    },
  });
}

it('constrains jscpd duplicates against a family baseline', async () => {
  const root = createTempRoot('verify-jscpd-baseline-');
  const result = await runBaselineCheck(root, createBaselineFamily());

  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('constrained across 1 families');
  expect(result.summaryText).toContain('Triage: debt=1');
});

it('fails jscpd baseline entries without registry-owned actionable triage', async () => {
  const root = createTempRoot('verify-jscpd-untriaged-baseline-');
  const result = await runBaselineCheck(root, createBaselineFamily(), writeDuplicateReport, {
    owner: '',
    targetAction: '',
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'jscpd-baseline-untriaged' }),
  ]);
});

it('fails jscpd debt without frozen acceptance and negative cases', async () => {
  const root = createTempRoot('verify-jscpd-acceptance-checklist-');
  const result = await runBaselineCheck(root, createBaselineFamily(), writeDuplicateReport, {
    acceptance: {
      criteria: ['Remove the exact measured duplicate family.'],
      negativeCases: [],
      nonGoals: ['Do not widen the owner seam.'],
    },
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'jscpd-baseline-untriaged' }),
  ]);
});

it('rejects contradictory disposition metadata added to the detector baseline', async () => {
  const root = createTempRoot('verify-jscpd-extra-metadata-');
  const result = await runBaselineCheck(
    root,
    createBaselineFamily({ owner: 'contradictory-owner', status: 'tool-noise' })
  );

  expect(result.violations).toEqual([expect.objectContaining({ rule: 'jscpd-baseline-metadata' })]);
});

it('fails stale jscpd baseline families that disappeared from the current report', async () => {
  const root = createTempRoot('verify-jscpd-stale-baseline-');
  const result = await runBaselineCheck(root, createBaselineFamily(), (reportPath) => {
    fs.writeFileSync(reportPath, JSON.stringify({ duplicates: [] }));
    return 0;
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'jscpd-baseline-stale',
      file: 'apps/extension/src/editor/controller',
    }),
  ]);
  expect(result.summaryText).toContain('Stale baseline families: 1');
});

it('fails a replaced jscpd pair with unchanged aggregate count and lines', async () => {
  const root = createTempRoot('verify-jscpd-sample-drift-');
  const result = await runBaselineCheck(
    root,
    createBaselineFamily({
      sampleFingerprint: '0'.repeat(64),
    }),
    (reportPath) => writeDuplicateReport(reportPath, 'replacement-a.ts', 'replacement-b.ts')
  );

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'jscpd-baseline-sample-drift' }),
  ]);
});
