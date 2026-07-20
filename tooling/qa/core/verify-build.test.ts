import { expect, it } from 'vitest';

import { runBuild } from './verify-build.mjs';

it('runs verify-build with injected lint and build runners', async () => {
  const lintFail = await runBuild({
    lintRunner: async () => ({ failed: true, output: 'lint failed' }),
  });
  expect(lintFail.status).toBe(1);
  expect(lintFail.stdout).toBe('lint failed');

  const buildPass = await runBuild({
    lintRunner: async () => ({ failed: false, output: '', warningCount: 0, errorCount: 0 }),
    buildRunner: () => ({ status: 0, stdout: 'build ok', stderr: '' }),
  });
  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toBe('build ok');

  const buildPassWithoutLint = await runBuild({
    enforceLint: false,
    lintRunner: async () => ({ failed: true, output: 'lint should be skipped' }),
    buildRunner: () => ({ status: 0, stdout: 'build without lint ok', stderr: '' }),
  });
  expect(buildPassWithoutLint.status).toBe(0);
  expect(buildPassWithoutLint.stdout).toBe('build without lint ok');
});

it('fails verify-build when css syntax warnings appear in zero-exit build output', async () => {
  const buildFail = await runBuild({
    enforceLint: false,
    lintRunner: async () => ({ failed: false, output: '', warningCount: 0, errorCount: 0 }),
    buildRunner: () => ({
      status: 0,
      stdout: '[esbuild css minify]\n[css-syntax-error] Unexpected "$"',
      stderr: '',
    }),
  });

  expect(buildFail.status).toBe(1);
  expect(buildFail.stderr).toContain('Blocking CSS syntax/minify warnings detected');
});

it('keeps non-css build warnings advisory when build exits successfully', async () => {
  const buildPass = await runBuild({
    enforceLint: false,
    lintRunner: async () => ({ failed: false, output: '', warningCount: 0, errorCount: 0 }),
    buildRunner: () => ({
      status: 0,
      stdout: '(!) Some chunks are larger than 500 kB after minification.',
      stderr: '',
    }),
  });

  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toContain('Some chunks are larger than 500 kB');
});
