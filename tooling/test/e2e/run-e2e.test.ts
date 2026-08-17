import fs from 'node:fs';

import { expect, it } from 'vitest';

import { parseE2eOptions, runE2e } from './run-e2e.mjs';

it('maps e2e suites to canonical Playwright spec sets', () => {
  expect(parseE2eOptions(['--suite', 'smoke'])).toMatchObject({
    headed: false,
    specs: ['tooling/test/e2e/extension-smoke.spec.ts'],
    suite: 'smoke',
  });
  expect(parseE2eOptions(['--suite', 'critical', '--headed'])).toMatchObject({
    headed: true,
    specs: [
      'tooling/test/e2e/extension-critical-full-page.spec.ts',
      'tooling/test/e2e/extension-critical-highlighter-geometry.spec.ts',
      'tooling/test/e2e/extension-critical-media.spec.ts',
      'tooling/test/e2e/extension-critical-offscreen.spec.ts',
      'tooling/test/e2e/extension-critical-popup.spec.ts',
      'tooling/test/e2e/extension-critical-video.spec.ts',
      'tooling/test/e2e/extension-critical-video-effects.spec.ts',
    ],
    suite: 'critical',
  });
  expect(parseE2eOptions(['--suite', 'security'])).toMatchObject({
    headed: false,
    specs: expect.arrayContaining([
      'tooling/test/e2e/security/production-surface.spec.ts',
      'tooling/test/e2e/security/ipc-authorization.spec.ts',
      'tooling/test/e2e/security/hostile-page.spec.ts',
    ]),
    suite: 'security',
  });
});

it('builds both production and instrumented artifacts for the security suite', () => {
  const builds: string[][] = [];
  const commands: string[][] = [];
  const result = runE2e({
    argv: ['--suite', 'security'],
    buildRunner: (args) => {
      builds.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
    commandRunner: (_command, args) => {
      commands.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(result.steps.map((step) => step.status)).toEqual(['ok', 'ok']);
  expect(builds).toEqual([
    ['run', 'qa:e2e:build:release'],
    ['run', 'qa:e2e:build:security'],
  ]);
  expect(commands).toHaveLength(1);
});

it('rejects unknown or missing CLI values before building', () => {
  expect(() => parseE2eOptions(['--typo'])).toThrow(/Unknown argument/u);
  expect(() => parseE2eOptions(['--suite'])).toThrow(/Missing value/u);
});

it('records build failure and blocks Playwright without invoking it', () => {
  const commands: string[] = [];
  const result = runE2e({
    argv: ['--suite', 'smoke'],
    buildRunner: () => ({ status: 7, stdout: 'build output', stderr: 'build error' }),
    commandRunner: (command) => {
      commands.push(command);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['E2E build', 'failed'],
    ['Playwright', 'blocked'],
  ]);
  expect(commands).toEqual([]);
});

it('records Playwright result after a green E2E build', () => {
  const result = runE2e({
    argv: ['--suite', 'critical'],
    buildRunner: () => ({ status: 0, stdout: '', stderr: '' }),
    commandRunner: (_command, args) => ({
      status: args.includes('tooling/test/e2e/extension-critical-video.spec.ts') ? 2 : 0,
      stdout: 'playwright output',
      stderr: '',
    }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['E2E build', 'ok'],
    ['Playwright', 'failed'],
  ]);
  expect(result.context).toEqual({
    mode: 'critical-headless',
    scope: 'runtime-smoke',
    suite: 'critical',
    targetFiles: [
      'tooling/test/e2e/extension-critical-full-page.spec.ts',
      'tooling/test/e2e/extension-critical-highlighter-geometry.spec.ts',
      'tooling/test/e2e/extension-critical-media.spec.ts',
      'tooling/test/e2e/extension-critical-offscreen.spec.ts',
      'tooling/test/e2e/extension-critical-popup.spec.ts',
      'tooling/test/e2e/extension-critical-video.spec.ts',
      'tooling/test/e2e/extension-critical-video-effects.spec.ts',
    ],
  });
});

it('keeps npm e2e scripts as thin aliases to the runner', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts['qa:e2e:smoke']).toBe(
    'node tooling/test/e2e/run-e2e.mjs --suite smoke'
  );
  expect(packageJson.scripts['qa:e2e:smoke:headed']).toBe(
    'node tooling/test/e2e/run-e2e.mjs --suite smoke --headed'
  );
  expect(packageJson.scripts['qa:e2e:security']).toBe(
    'node tooling/test/e2e/run-e2e.mjs --suite security'
  );
  expect(packageJson.scripts['qa:e2e:smoke']).not.toContain('xvfb-run');
});
