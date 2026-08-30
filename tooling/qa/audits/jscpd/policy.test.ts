import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  JSCPD_ENGINE_VERSION,
  JSCPD_WORKERS,
  readJscpdPlatformClosure,
  resolveJscpdNativeRuntime,
} from './jscpd-detector.mjs';
import { createTempRoot } from '../../test-support/test-helpers';
import { JSCPD_SCAN_TARGETS } from './check.mjs';

it('rejects missing jscpd roots', async () => {
  const module = await import('./check.mjs');
  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath: path.join(createTempRoot('jscpd-missing-root-'), 'report.json'),
      scanTargets: ['missing-jscpd-root-for-negative-proof'],
      runCommandImpl: () => ({ status: 0, stdout: '', stderr: '' }),
    })
  ).toThrow('jscpd scan root does not exist');
});

it('preserves status-one jscpd operational errors', async () => {
  const module = await import('./check.mjs');
  expect(() =>
    module.runJscpdCheck({
      executable: 'jscpd',
      reportPath: path.join(createTempRoot('jscpd-error-'), 'report.json'),
      scanTargets: ['tooling'],
      runCommandImpl: () => ({ status: 1, stdout: '', stderr: 'native scanner error' }),
    })
  ).toThrow('native scanner error');
});

it('pins the complete native platform closure and resolves the selected binary', () => {
  const closure = readJscpdPlatformClosure();
  expect(closure.engineVersion).toBe(JSCPD_ENGINE_VERSION);
  expect(closure.platformPackages).toHaveLength(6);
  expect(closure.platformPackages.every((entry) => entry.version === JSCPD_ENGINE_VERSION)).toBe(
    true
  );
  const runtime = resolveJscpdNativeRuntime();
  expect(runtime.platformPackage).toMatch(/^jscpd-(?:linux|darwin|windows)-/u);
  expect(runtime.binaryDigest).toMatch(/^[a-f0-9]{64}$/u);
  expect(fs.existsSync(runtime.executable)).toBe(true);
});

it('makes all relied-on detector defaults and resource policy explicit', async () => {
  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/jscpd.json', 'utf8'));
  expect(config).toMatchObject({
    minLines: 5,
    minTokens: 60,
    maxLines: 10000,
    maxSize: '1mb',
    mode: 'mild',
    threshold: 0,
    exitCode: 1,
    reporters: ['json'],
    output: '.tmp/jscpd',
    silent: true,
    noTips: true,
    gitignore: true,
    followSymlinks: false,
    absolute: true,
    ignoreCase: false,
    blame: false,
    crossFormats: [],
    skipLocal: false,
    ignorePattern: [],
  });
  expect(config.format).toEqual([
    'javascript',
    'jsx',
    'typescript',
    'tsx',
    'css',
    'scss',
    'less',
    'html',
    'bash',
    'yaml',
  ]);

  const module = await import('./check.mjs');
  const reportPath = path.join(createTempRoot('jscpd-args-'), 'report.json');
  let args: string[] = [];
  module.runJscpdCheck({
    baselinePath: null,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: (_command, receivedArgs) => {
      args = receivedArgs;
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          duplicates: [],
          statistics: { formats: {}, total: { sources: 0, clones: 0 } },
        })
      );
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  expect(args).toContain('--workers');
  expect(args).toContain(String(JSCPD_WORKERS));
  expect(args).not.toContain('--min-duplicated-lines');
  expect(args).toContain('--no-colors');
  expect(args.slice(-JSCPD_SCAN_TARGETS.length)).toEqual([...JSCPD_SCAN_TARGETS].sort());
});

it('keeps every ignore class rooted and disables test-support scanning', () => {
  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/jscpd.json', 'utf8'));
  expect(config.ignore).toEqual(
    expect.arrayContaining([
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.test-support.*',
      '**/test-support/**',
      '**/*.data.*',
      '**/*.constants.*',
      '**/*.json',
      '**/tooling/test/**',
      'docs/**',
      'node_modules/**',
      '.tmp/**',
      'dist/**',
    ])
  );
});

it('admits jscpd only in repository and release blocking profiles', () => {
  const profiles = JSON.parse(
    fs.readFileSync('tooling/configs/qa/audit-profiles.data.json', 'utf8')
  );
  expect(
    Object.fromEntries(
      profiles.profiles.map((profile) => [
        profile.id,
        profile.controls.find((control) => control.id === 'jscpd')?.requirement,
      ])
    )
  ).toEqual({
    repository: 'required',
    pr: 'excluded',
    security: 'excluded',
    coverage: 'excluded',
    release: 'required',
  });
  const registry = fs.readFileSync(
    'tooling/qa/evidence/repo-audit-evidence/registry.data.mjs',
    'utf8'
  );
  expect(registry).toContain("tool: 'audits/jscpd.mjs'");
  const catalog = fs.readFileSync('tooling/qa/composition/catalog/catalog.data.mjs', 'utf8');
  expect(catalog).toContain("['jscpd'");
});
