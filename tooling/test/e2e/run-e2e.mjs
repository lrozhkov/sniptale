import { isExecutedAsScript, runCommand, runNpm } from '../../qa/core/shared.mjs';
import { createBlockedStep, createProcessStep } from '../../qa/core/focused-qa-results.mjs';
import { timeSyncStep } from '../../qa/core/step-timing.helpers.mjs';
import { parseWrapperArguments } from '../../qa/wrappers/cli-contracts.mjs';
import { runObservedWrapper } from '../../qa/wrappers/observed/runner.mjs';

const SUITES = {
  smoke: ['tooling/test/e2e/extension-smoke.spec.ts'],
  critical: [
    'tooling/test/e2e/extension-critical-media.spec.ts',
    'tooling/test/e2e/extension-critical-offscreen.spec.ts',
    'tooling/test/e2e/extension-critical-popup.spec.ts',
    'tooling/test/e2e/extension-critical-video.spec.ts',
    'tooling/test/e2e/extension-critical-video-effects.spec.ts',
  ],
  all: [
    'tooling/test/e2e/extension-smoke.spec.ts',
    'tooling/test/e2e/extension-critical-media.spec.ts',
    'tooling/test/e2e/extension-critical-offscreen.spec.ts',
    'tooling/test/e2e/extension-critical-popup.spec.ts',
    'tooling/test/e2e/extension-critical-video.spec.ts',
    'tooling/test/e2e/extension-critical-video-effects.spec.ts',
  ],
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

function shouldUseXvfb({ headed }) {
  return !headed && process.platform === 'linux' && !process.env.DISPLAY;
}

function createE2eEnv({ headed }) {
  return {
    ...process.env,
    TMPDIR: '/tmp',
    TMP: '/tmp',
    TEMP: '/tmp',
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '.playwright-browsers',
    PLAYWRIGHT_HEADLESS: headed ? '0' : '1',
  };
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

  const buildStep = timeSyncStep(() =>
    createProcessStep('E2E build', buildRunner(['run', 'qa:e2e:build'], { stdio: 'pipe' }), {
      advice: 'fix the E2E artifact build before rerunning the browser suite',
    })
  );
  if (buildStep.status === 'failed') {
    return {
      context: createE2eContext(options),
      options,
      steps: [buildStep, createBlockedStep('Playwright', 'blocked by E2E build failure')],
    };
  }

  const playwrightArgs = ['exec', 'playwright', '--', 'test', ...options.specs];
  const env = createE2eEnv(options);
  const playwrightStep = timeSyncStep(() => {
    const result = shouldUseXvfb(options)
      ? commandRunner('xvfb-run', ['-a', 'npm', ...playwrightArgs], { env, stdio: 'pipe' })
      : commandRunner('npm', playwrightArgs, { env, stdio: 'pipe' });

    return createProcessStep('Playwright', result, {
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
