import { isExecutedAsScript, runCommand, runNpm } from '../../qa/core/shared.mjs';
import { createBlockedStep, createProcessStep } from '../../qa/core/focused-qa-results.mjs';
import { timeSyncStep } from '../../qa/core/step-timing.helpers.mjs';
import { parseWrapperArguments } from '../../qa/wrappers/cli-contracts.mjs';
import { runObservedWrapper } from '../../qa/wrappers/observed/runner.mjs';

const SECURITY_SPECS = [
  'tooling/test/e2e/security/production-surface.spec.ts',
  'tooling/test/e2e/security/ipc-authorization.spec.ts',
  'tooling/test/e2e/security/permission-revocation.spec.ts',
  'tooling/test/e2e/security/mv3-lifecycle.spec.ts',
  'tooling/test/e2e/security/secret-retention.spec.ts',
  'tooling/test/e2e/security/privacy-erasure.spec.ts',
  'tooling/test/e2e/security/hostile-page.spec.ts',
];
const SMOKE_SPECS = ['tooling/test/e2e/extension-smoke.spec.ts'];
const CRITICAL_SPECS = [
  'tooling/test/e2e/extension-critical-full-page.spec.ts',
  'tooling/test/e2e/extension-critical-highlighter-geometry.spec.ts',
  'tooling/test/e2e/extension-critical-media.spec.ts',
  'tooling/test/e2e/extension-critical-offscreen.spec.ts',
  'tooling/test/e2e/extension-critical-popup.spec.ts',
  'tooling/test/e2e/extension-critical-recording-restart.spec.ts',
  'tooling/test/e2e/extension-critical-video.spec.ts',
  'tooling/test/e2e/extension-critical-video-effects.spec.ts',
];
const E2E_BUILD_DIRS = {
  release: '.tmp/e2e-builds/release',
  security: '.tmp/e2e-builds/security',
  test: '.tmp/e2e-builds/test',
};

const SUITES = {
  smoke: SMOKE_SPECS,
  critical: CRITICAL_SPECS,
  security: SECURITY_SPECS,
  all: [...SMOKE_SPECS, ...CRITICAL_SPECS, ...SECURITY_SPECS],
};

export function parseE2eOptions(argv = []) {
  const parsed = parseWrapperArguments('qa:e2e', argv);
  const suite = parsed.values.suite ?? 'smoke';
  if (!Object.hasOwn(SUITES, suite)) {
    throw new Error(
      `Unsupported e2e suite "${suite}". Expected: ${Object.keys(SUITES).join(', ')}`
    );
  }

  return {
    headed: parsed.values.headed ?? false,
    suite,
    specs: SUITES[suite],
    ...(parsed.values.help ? { help: true, helpText: parsed.help } : {}),
  };
}

function shouldUseXvfb({ headed }, { requiresDisplay }) {
  return !headed && requiresDisplay && process.platform === 'linux' && !process.env.DISPLAY;
}

function createE2eEnv({ headed }, { requiresDisplay }) {
  return {
    ...process.env,
    TMPDIR: '/tmp',
    TMP: '/tmp',
    TEMP: '/tmp',
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '.playwright-browsers',
    PLAYWRIGHT_HEADLESS: headed || requiresDisplay ? '0' : '1',
  };
}

function combineResults(results) {
  return {
    status: results.find((result) => result.status !== 0)?.status ?? 0,
    stdout: results
      .map((result) => result.stdout ?? '')
      .filter(Boolean)
      .join('\n'),
    stderr: results
      .map((result) => result.stderr ?? '')
      .filter(Boolean)
      .join('\n'),
  };
}

function buildScriptsForSuite(suite) {
  if (suite === 'security') return ['qa:e2e:build:release', 'qa:e2e:build:security'];
  if (suite === 'all') {
    return ['qa:e2e:build', 'qa:e2e:build:release', 'qa:e2e:build:security'];
  }
  return ['qa:e2e:build'];
}

function playwrightWavesForSuite(suite, specs) {
  if (suite === 'security') {
    return [{ buildDir: E2E_BUILD_DIRS.security, requiresDisplay: false, specs }];
  }
  if (suite === 'all') {
    return [
      {
        buildDir: E2E_BUILD_DIRS.test,
        requiresDisplay: true,
        specs: [...SMOKE_SPECS, ...CRITICAL_SPECS],
      },
      { buildDir: E2E_BUILD_DIRS.security, requiresDisplay: false, specs: SECURITY_SPECS },
    ];
  }
  return [{ buildDir: E2E_BUILD_DIRS.test, requiresDisplay: suite === 'critical', specs }];
}

function createE2eContext(options) {
  return {
    mode: `${options.suite}-${options.headed ? 'headed' : 'headless'}`,
    scope: 'runtime-smoke',
    suite: options.suite,
    targetFiles: options.specs,
  };
}

export function runE2e({
  argv = process.argv.slice(2),
  buildRunner = runNpm,
  commandRunner = runCommand,
} = {}) {
  const options = parseE2eOptions(argv);
  if (options.help) return { help: true, helpText: options.helpText, options, steps: [] };
  if (options.headed && process.platform === 'linux' && !process.env.DISPLAY) {
    throw new Error('Headed e2e requires DISPLAY. Start an X server or run a headless suite.');
  }

  const buildStep = timeSyncStep(() => {
    const results = [];
    for (const script of buildScriptsForSuite(options.suite)) {
      const result = buildRunner(['run', script], { stdio: 'pipe' });
      results.push(result);
      if (result.status !== 0) break;
    }
    return createProcessStep('E2E build', combineResults(results), {
      advice: 'fix the E2E artifact build before rerunning the browser suite',
    });
  });
  if (buildStep.status === 'failed') {
    return {
      context: createE2eContext(options),
      options,
      steps: [buildStep, createBlockedStep('Playwright', 'blocked by E2E build failure')],
    };
  }

  const playwrightStep = timeSyncStep(() => {
    const results = [];
    for (const wave of playwrightWavesForSuite(options.suite, options.specs)) {
      const playwrightArgs = ['exec', 'playwright', '--', 'test', ...wave.specs];
      const env = {
        ...createE2eEnv(options, wave),
        SNIPTALE_EXTENSION_BUILD_DIR: wave.buildDir,
      };
      const result = shouldUseXvfb(options, wave)
        ? commandRunner('xvfb-run', ['-a', 'npm', ...playwrightArgs], { env, stdio: 'pipe' })
        : commandRunner('npm', playwrightArgs, { env, stdio: 'pipe' });
      results.push(result);
      if (result.status !== 0) break;
    }

    return createProcessStep('Playwright', combineResults(results), {
      advice: 'inspect the Playwright report and the recorded QA log before rerunning',
    });
  });

  return {
    context: createE2eContext(options),
    options,
    steps: [buildStep, playwrightStep],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:e2e',
    label: 'QA E2E',
    argv,
    execute: async () => runE2e({ argv }),
  });
  process.exitCode = outcome.exitCode;
}
