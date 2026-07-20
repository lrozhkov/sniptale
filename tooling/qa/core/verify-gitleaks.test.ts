import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';

it('maps Gitleaks JSON findings to audit violations', async () => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const result = module.runGitleaksCheck({
    executable: 'gitleaks',
    configPath: 'tooling/configs/qa/gitleaks.toml',
    reportPath,
    runCommandImpl: (command, args) => {
      expect(command).toBe('gitleaks');
      expect(args).toEqual(
        expect.arrayContaining(['dir', '.', '--report-format', 'json', '--redact'])
      );
      fs.writeFileSync(
        reportPath,
        JSON.stringify([
          {
            RuleID: 'generic-api-key',
            Description: 'Generic API Key',
            File: 'src/example.ts',
            StartLine: 7,
            Fingerprint: 'worktree:src/example.ts:generic-api-key:7',
          },
        ])
      );
      return { status: 1, stdout: '', stderr: '' };
    },
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'generic-api-key',
      file: 'src/example.ts',
      line: 7,
      message: '[worktree] Generic API Key',
    }),
  ]);
  expect(result.scopes).toEqual(['worktree']);
  expect(result.summaryText).toContain('worktree');
});

it('runs worktree and Git history secret scans as one strict audit control', async () => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-history-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const baselinePath = path.join(root, 'gitleaks-baseline.json');
  fs.writeFileSync(baselinePath, '[]');
  const commands: string[][] = [];
  const result = module.runGitleaksCheck({
    baselinePath,
    executable: 'gitleaks',
    reportPath,
    scopes: ['worktree', 'history'],
    runCommandImpl: (_command, args) => {
      commands.push(args);
      const outputPath = args[args.indexOf('--report-path') + 1];
      fs.writeFileSync(outputPath, '[]');
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(commands.map((args) => args.slice(0, 2))).toEqual([
    ['dir', '.'],
    ['git', '.'],
  ]);
  expect(result.scopes).toEqual(['worktree', 'history']);
  expect(result.summaryText).toContain('worktree, history');
  expect(fs.existsSync(reportPath)).toBe(true);
});

it('rejects stale reviewed Gitleaks history findings', async () => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-stale-baseline-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const baselinePath = path.join(root, 'gitleaks-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify([
      {
        RuleID: 'generic-api-key',
        File: 'src/fixture.ts',
        StartLine: 7,
        Commit: 'a'.repeat(40),
        Fingerprint: `${'a'.repeat(40)}:src/fixture.ts:generic-api-key:7`,
        SniptaleDebtId: 'noise.gitleaks.fixture',
        SniptaleScope: 'history',
      },
    ])
  );
  const result = module.runGitleaksCheck({
    baselinePath,
    executable: 'gitleaks',
    reportPath,
    scopes: ['history'],
    runCommandImpl: (_command, args) => {
      fs.writeFileSync(args[args.indexOf('--report-path') + 1], '[]');
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'gitleaks-baseline-stale',
      file: 'src/fixture.ts',
      line: 7,
    }),
  ]);
});

it('matches a reviewed history finding by its complete tuple', async () => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-complete-tuple-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const baselinePath = path.join(root, 'gitleaks-baseline.json');
  const finding = {
    RuleID: 'generic-api-key',
    Description: 'reviewed synthetic fixture',
    File: 'src/fixture.ts',
    StartLine: 7,
    Commit: 'a'.repeat(40),
    Fingerprint: `${'a'.repeat(40)}:src/fixture.ts:generic-api-key:7`,
  };
  fs.writeFileSync(
    baselinePath,
    JSON.stringify([
      {
        ...finding,
        SniptaleDebtId: 'noise.gitleaks.fixture',
        SniptaleScope: 'history',
      },
    ])
  );

  const result = module.runGitleaksCheck({
    baselinePath,
    executable: 'gitleaks',
    reportPath,
    scopes: ['history'],
    runCommandImpl: () => {
      fs.writeFileSync(reportPath, JSON.stringify([finding]));
      return { status: 1, stdout: '', stderr: '' };
    },
  });

  expect(result.violations).toEqual([]);
  expect(result.summaryText).toContain('1/1 matched');
});

it('requires Gitleaks instead of skipping missing CLI', async () => {
  const module = await import('../audits/gitleaks.mjs');

  expect(() => module.runGitleaksCheck({ executable: null })).toThrow('Gitleaks CLI is required');
});

it('rejects a baseline fingerprint that disagrees with its finding metadata', async () => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-fingerprint-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const baselinePath = path.join(root, 'gitleaks-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify([
      {
        RuleID: 'generic-api-key',
        File: 'src/fixture.ts',
        StartLine: 7,
        Commit: 'a'.repeat(40),
        Fingerprint: `${'a'.repeat(40)}:src/other.ts:generic-api-key:7`,
        SniptaleDebtId: 'noise.gitleaks.fixture',
        SniptaleScope: 'history',
      },
    ])
  );

  expect(() =>
    module.runGitleaksCheck({
      baselinePath,
      executable: 'gitleaks',
      reportPath,
      runCommandImpl: () => {
        fs.writeFileSync(reportPath, '[]');
        return { status: 0, stdout: '', stderr: '' };
      },
    })
  ).toThrow('fingerprint does not match finding metadata');
});

it.each([
  {
    name: 'missing Commit',
    findings: [
      {
        RuleID: 'generic-api-key',
        File: 'src/fixture.ts',
        StartLine: 7,
        Fingerprint: 'src/fixture.ts:generic-api-key:7',
      },
    ],
    expected: /requires a 40-character Commit/u,
  },
  {
    name: 'spoofed fingerprint tuple',
    findings: [
      {
        RuleID: 'generic-api-key',
        File: 'src/fixture.ts',
        StartLine: 7,
        Commit: 'a'.repeat(40),
        Fingerprint: `${'a'.repeat(40)}:src/spoofed.ts:generic-api-key:7`,
      },
    ],
    expected: /fingerprint does not match its complete tuple/u,
  },
  {
    name: 'duplicate observed fingerprint',
    findings: Array.from({ length: 2 }, () => ({
      RuleID: 'generic-api-key',
      File: 'src/fixture.ts',
      StartLine: 7,
      Commit: 'a'.repeat(40),
      Fingerprint: `${'a'.repeat(40)}:src/fixture.ts:generic-api-key:7`,
    })),
    expected: /duplicates fingerprint/u,
  },
])('rejects $name in history observations', async ({ expected, findings }) => {
  const module = await import('../audits/gitleaks.mjs');
  const root = createTempRoot('verify-gitleaks-observed-tuple-');
  const reportPath = path.join(root, 'gitleaks-report.json');
  const baselinePath = path.join(root, 'gitleaks-baseline.json');
  fs.writeFileSync(baselinePath, '[]');

  expect(() =>
    module.runGitleaksCheck({
      baselinePath,
      executable: 'gitleaks',
      reportPath,
      scopes: ['history'],
      runCommandImpl: () => {
        fs.writeFileSync(reportPath, JSON.stringify(findings));
        return { status: 1, stdout: '', stderr: '' };
      },
    })
  ).toThrow(expected);
});
