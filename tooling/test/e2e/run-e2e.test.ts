import fs from 'node:fs';
import { createRequire } from 'node:module';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { runCommand } from '../../qa/runtime/process/shared-process.mjs';

import { expect, it } from 'vitest';

import playwrightConfig, { DEFAULT_PLAYWRIGHT_WORKERS } from '../../../playwright.config';
import { parseE2eOptions, runE2e } from './run-e2e.mjs';

it('uses bounded file-level parallelism by default while preserving explicit worker authority', () => {
  expect(DEFAULT_PLAYWRIGHT_WORKERS).toBe(3);
  expect(playwrightConfig.fullyParallel).toBe(false);
  expect(playwrightConfig.workers).toBe(
    process.env.SNIPTALE_QA_PLAYWRIGHT_WORKERS
      ? Number(process.env.SNIPTALE_QA_PLAYWRIGHT_WORKERS)
      : DEFAULT_PLAYWRIGHT_WORKERS
  );
});

it('maps e2e suites to canonical Playwright spec sets', () => {
  expect(parseE2eOptions(['--suite', 'smoke'])).toMatchObject({
    headed: false,
    specs: ['tooling/test/e2e/extension-smoke/extension-smoke.spec.ts'],
    suite: 'smoke',
  });
  expect(parseE2eOptions(['--suite', 'critical', '--headed'])).toMatchObject({
    headed: true,
    specs: [
      'tooling/test/e2e/extension-critical/extension-critical-frozen-selection.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-scenario-viewing.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-full-page.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-highlighter-geometry.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-page-toolbar-fit.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-video-review.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-header-gpu.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-click-lens-overflow.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-export-cancellation.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-focus-border.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-image-editor-persistence.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-media.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-offscreen.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-popup.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-recording-restart.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-video.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-video-effects.spec.ts',
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

it.each([
  'tooling/test/e2e/extension-critical/extension-critical-gallery-header-gpu.spec.ts',
  'tooling/test/e2e/extension-critical/extension-critical-click-lens-overflow.spec.ts',
])(
  'routes the pixel guard %s through critical and all without expanding smoke or security',
  (spec) => {
    for (const suite of ['critical', 'all']) {
      const matches = parseE2eOptions(['--suite', suite]).specs.filter((file) => file === spec);
      expect(matches).toEqual([spec]);
    }
    for (const suite of ['smoke', 'security'])
      expect(parseE2eOptions(['--suite', suite]).specs).not.toContain(spec);
  }
);

it('builds both production and instrumented artifacts for the security suite', () => {
  const builds: string[][] = [];
  const commandNames: string[] = [];
  const commands: string[][] = [];
  const result = runE2e({
    argv: ['--suite', 'security'],
    buildRunner: (args) => {
      builds.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
    commandRunner: (command, args) => {
      commandNames.push(command);
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
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    expect(commandNames).toEqual(['xvfb-run']);
  }
  expect(commands[0]).toContain('--workers=1');
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
  let playwrightHeadless: string | undefined;
  let extensionBuildDir: string | undefined;
  const result = runE2e({
    argv: ['--suite', 'critical'],
    buildRunner: () => ({ status: 0, stdout: '', stderr: '' }),
    commandRunner: (_command, args, options) => {
      playwrightHeadless = options.env.PLAYWRIGHT_HEADLESS;
      extensionBuildDir = options.env.SNIPTALE_EXTENSION_BUILD_DIR;
      return {
        status: args.includes(
          'tooling/test/e2e/extension-critical/extension-critical-video.spec.ts'
        )
          ? 2
          : 0,
        stdout: 'playwright output',
        stderr: '',
      };
    },
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['E2E build', 'ok'],
    ['Playwright', 'failed'],
  ]);
  expect(playwrightHeadless).toBe('0');
  expect(extensionBuildDir).toBe('.tmp/e2e-builds/test');
  expect(extensionBuildDir).not.toBe('dist');
  expect(result.context).toEqual({
    mode: 'critical-headless',
    scope: 'runtime-smoke',
    suite: 'critical',
    targetFiles: [
      'tooling/test/e2e/extension-critical/extension-critical-frozen-selection.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-scenario-viewing.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-full-page.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-highlighter-geometry.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-page-toolbar-fit.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-video-review.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-header-gpu.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-click-lens-overflow.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-export-cancellation.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-gallery-focus-border.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-image-editor-persistence.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-media.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-offscreen.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-popup.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-recording-restart.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-video.spec.ts',
      'tooling/test/e2e/extension-critical/extension-critical-video-effects.spec.ts',
    ],
  });
});

it('never loads a browser E2E suite from the canonical product dist directory', () => {
  for (const suite of ['smoke', 'critical', 'security', 'all']) {
    const buildDirs: string[] = [];
    const result = runE2e({
      argv: ['--suite', suite],
      buildRunner: () => ({ status: 0, stdout: '', stderr: '' }),
      commandRunner: (_command, _args, options) => {
        buildDirs.push(options.env.SNIPTALE_EXTENSION_BUILD_DIR);
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    expect(result.steps.map((step) => step.status)).toEqual(['ok', 'ok']);
    expect(buildDirs).not.toContain('dist');
    expect(buildDirs.every((buildDir) => buildDir.startsWith('.tmp/e2e-builds/'))).toBe(true);
  }
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

it('isolates every browser E2E build from the canonical product dist directory', () => {
  const viteSource = fs.readFileSync('apps/extension/vite.config.ts', 'utf8');
  for (const output of [
    '.tmp/e2e-builds/test',
    '.tmp/e2e-builds/release',
    '.tmp/e2e-builds/security',
  ]) {
    expect(viteSource).toContain(output);
  }
  expect(viteSource).not.toContain("'dist-security-e2e'");
  expect(viteSource).not.toContain("'dist-release-e2e'");
});

it('keeps performance opt-in and forwards an individual case with one worker', () => {
  expect(parseE2eOptions(['--suite', 'all']).specs).not.toContain(
    'tooling/test/e2e/preview-performance.spec.ts'
  );
  expect(playwrightConfig.testIgnore).toContain('**/preview-performance*.spec.ts');
  const commands: string[][] = [];
  const builds: string[][] = [];
  runE2e({
    argv: ['--suite', 'preview-performance', '--case', 'quick preview native: plain', '--list'],
    buildRunner: (args) => {
      builds.push(args);
      return { status: 0 };
    },
    commandRunner: (_command, args) => {
      commands.push(args);
      return { status: 0 };
    },
  });
  expect(builds).toEqual([]);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toEqual(
    expect.arrayContaining([
      '--workers=1',
      '--list',
      '--grep',
      '(?:^| )quick preview native: plain$',
      '--config=tooling/test/e2e/preview-performance.config.ts',
    ])
  );
  expect(() => parseE2eOptions(['--suite', 'critical', '--case', 'plain'])).toThrow(
    /require --suite preview-performance/u
  );
});

it('treats a dot in a selected performance test name as a literal', () => {
  let grep: string | undefined;
  runE2e({
    argv: ['--suite', 'preview-performance', '--case', 'sample.case'],
    buildRunner: () => ({ status: 0 }),
    commandRunner: (_command, args) => {
      grep = args[args.indexOf('--grep') + 1];
      return { status: 0 };
    },
  });
  expect(grep).toBe(String.raw`(?:^| )sample\.case$`);
});

it('lists optional cases without a display server or an artifact build', () => {
  const commands: string[] = [];
  const result = runE2e({
    argv: ['--suite', 'preview-performance', '--list', '--headed'],
    buildRunner: () => {
      throw new Error('List must not build');
    },
    commandRunner: (command) => {
      commands.push(command);
      return { status: 0 };
    },
  });
  expect(result.steps.map((step) => step.status)).toEqual(['ok', 'ok']);
  expect(commands).toEqual(['npm']);
});

it('selects only the named performance case when catalog names overlap', () => {
  let grep = '';
  const title = 'full editor manual1080p30: annotation';
  runE2e({
    argv: ['--suite', 'preview-performance', '--case', title, '--list'],
    commandRunner: (_command, args) => {
      grep = args[args.indexOf('--grep') + 1]!;
      return { status: 0 };
    },
  });
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const suffixes = ['-border', '-drag', '-border-drag'];
  const catalogs: string[][] = [];
  for (const filter of [[], ['--grep', grep]]) {
    const listed = runCommand(
      process.execPath,
      [
        cli,
        'test',
        '--config=tooling/test/e2e/preview-performance.config.ts',
        '--list',
        '--reporter=json',
        ...filter,
      ],
      {
        env: {
          SNIPTALE_PREVIEW_PERFORMANCE_CASES:
            'annotation,annotation-border,annotation-drag,annotation-border-drag',
          SNIPTALE_PREVIEW_PERFORMANCE_MODES: 'manual1080p30',
          SNIPTALE_PREVIEW_PERFORMANCE_EDITORS: 'native',
        },
      }
    );
    expect(listed.status, listed.stderr).toBe(0);
    const report: unknown = JSON.parse(listed.stdout);
    if (!isRecord(report) || !Array.isArray(report['suites']))
      throw new Error('Playwright did not return its collected performance catalog.');
    expect(report['errors']).toEqual([]);
    expect(report['suites']).toHaveLength(1);
    const suite = report['suites'][0];
    if (!isRecord(suite) || !Array.isArray(suite['specs']))
      throw new Error('Playwright performance catalog has no collected cases.');
    catalogs.push(
      suite['specs'].map((spec: unknown) => {
        if (!isRecord(spec) || typeof spec['title'] !== 'string')
          throw new Error('Playwright returned a case without a title.');
        return spec['title'];
      })
    );
  }
  expect(catalogs[0]).toEqual(
    expect.arrayContaining([title, ...suffixes.map((suffix) => title + suffix)])
  );
  expect(catalogs[1]).toEqual([title]);
}, 30_000);
