import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { resolveJscpdExecutable } from '../tools/tool-cli.mjs';
import { createTempRoot } from './test-helpers';

function createJscpdPaths(prefix: string) {
  const root = createTempRoot(prefix);
  return {
    baselinePath: path.join(root, 'jscpd-baseline.json'),
    reportPath: path.join(root, 'jscpd-report.json'),
  };
}

const MAINTENANCE_SAMPLE_FINGERPRINT =
  '8ba177f632eda97357fe38dded7e8da6a44e7de82d0d20955aff136446f1b261';

function writeOwnedMaintenanceBaseline(baselinePath: string, debtRegistryPath: string) {
  const scope = {
    family: 'tooling/qa/core',
    count: 1,
    lines: 7,
    sampleFingerprint: MAINTENANCE_SAMPLE_FINGERPRINT,
  };
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ families: [{ debtId: 'debt.jscpd.qa-core', ...scope }] })
  );
  fs.writeFileSync(
    debtRegistryPath,
    JSON.stringify({
      entries: [
        {
          id: 'debt.jscpd.qa-core',
          classification: 'debt',
          owner: 'qa-core',
          reason: 'Bounded ordinary maintenance family.',
          targetAction: 'Consolidate inside qa-core.',
          acceptance: {
            criteria: ['Remove the exact measured duplicate family.'],
            negativeCases: ['Reject stale or replacement clone populations.'],
            nonGoals: ['Do not merge unrelated owners.'],
          },
          source: { kind: 'jscpd', key: scope.family },
          scope,
        },
      ],
    })
  );
}

it('rejects missing jscpd roots', async () => {
  const module = await import('../audits/jscpd.mjs');
  const { reportPath } = createJscpdPaths('verify-jscpd-missing-root-');

  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath,
      scanTargets: ['missing-jscpd-root-for-negative-proof'],
      runCommandImpl: () => ({ status: 0, stdout: '', stderr: '' }),
    })
  ).toThrow('jscpd scan root does not exist');
});

it('preserves status-one jscpd operational errors', async () => {
  const module = await import('../audits/jscpd.mjs');
  const { reportPath } = createJscpdPaths('verify-jscpd-operational-error-');

  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath,
      scanTargets: ['tooling'],
      runCommandImpl: () => ({ status: 1, stdout: '', stderr: 'ENOENT from scanner' }),
    })
  ).toThrow('ENOENT from scanner');
});

it('keeps jscpd ignores rooted from nested config locations', () => {
  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/jscpd.json', 'utf8'));
  const ownerSpecificIgnores = config.ignore.filter((pattern) => pattern.includes('tooling/qa/'));

  expect(ownerSpecificIgnores.length).toBeGreaterThan(0);
  expect(ownerSpecificIgnores.every((pattern) => pattern.startsWith('**/'))).toBe(true);
  expect(config.ignore).toContain('**/*.test-support.*');
  expect(config.ignore).toContain('**/test-support.*');
  expect(config.ignore).toContain('**/test-support/**');
  expect(config.ignore).toContain('**/*.json');
});

it('excludes exact test-support.ts and test-support.tsx basenames from the live scanner', () => {
  const root = createTempRoot('verify-jscpd-test-support-ignore-');
  const reportRoot = path.join(root, 'report');
  const configPath = path.join(root, 'jscpd.json');
  const source = Array.from(
    { length: 12 },
    (_, index) => `export const repeatedValue${index} = '${index}-scanner-negative-fixture';`
  ).join('\n');
  for (const relativePath of [
    'excluded/a/test-support.ts',
    'excluded/b/test-support.tsx',
    'included/a/runtime.ts',
    'included/b/runtime.ts',
  ]) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${source}\n`);
  }

  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/jscpd.json', 'utf8'));
  fs.writeFileSync(configPath, JSON.stringify({ ...config, output: reportRoot }));
  const executable = resolveJscpdExecutable();
  expect(executable).not.toBeNull();

  const result = spawnSync(executable!, ['--config', configPath, root], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);

  const report = JSON.parse(fs.readFileSync(path.join(reportRoot, 'jscpd-report.json'), 'utf8'));
  const duplicatePaths = report.duplicates.flatMap(
    (entry: { firstFile: { name: string }; secondFile: { name: string } }) => [
      entry.firstFile.name,
      entry.secondFile.name,
    ]
  );
  expect(duplicatePaths.some((file: string) => file.includes('test-support.'))).toBe(false);
  expect(duplicatePaths.some((file: string) => file.endsWith('/included/a/runtime.ts'))).toBe(true);
  expect(duplicatePaths.some((file: string) => file.endsWith('/included/b/runtime.ts'))).toBe(true);
});

it('keeps unrelated app owners as a pair instead of one broad app-root family', async () => {
  const module = await import('../audits/jscpd.mjs');
  const [summary] = module.summarizeJscpdFamilies([
    {
      lines: 7,
      firstFile: { name: 'apps/extension/src/features/editor/document/gradient.ts' },
      secondFile: { name: 'apps/extension/src/features/video/project/gradient.ts' },
    },
  ]);

  expect(summary?.family).toBe(
    'apps/extension/src/features/editor/document <-> ' + 'apps/extension/src/features/video/project'
  );
});

it('accepts an explicitly owned ordinary-maintenance baseline', async () => {
  const module = await import('../audits/jscpd.mjs');
  const { baselinePath, reportPath } = createJscpdPaths('verify-jscpd-maintenance-');
  const debtRegistryPath = path.join(path.dirname(baselinePath), 'technical-debt.data.json');
  writeOwnedMaintenanceBaseline(baselinePath, debtRegistryPath);
  const result = module.runJscpdCheck({
    baselinePath,
    debtRegistryPath,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: () => {
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          duplicates: [
            {
              lines: 7,
              firstFile: { name: 'tooling/qa/core/a.mjs' },
              secondFile: { name: 'tooling/qa/core/b.mjs' },
            },
          ],
        })
      );
      return { status: 1, stdout: '', stderr: '' };
    },
  });

  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('debt=1');
});
