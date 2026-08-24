import { expect, it } from 'vitest';

import { runBuild } from './verify-build.mjs';

it('runs verify-build with an injected build runner', async () => {
  const buildFail = await runBuild({
    buildRunner: () => ({ status: 1, stdout: '', stderr: 'build failed' }),
  });
  expect(buildFail.status).toBe(1);
  expect(buildFail.stderr).toBe('build failed');

  const buildPass = await runBuild({
    buildRunner: () => ({ status: 0, stdout: 'build ok', stderr: '' }),
  });
  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toBe('build ok');
});

it('fails verify-build when css syntax warnings appear in zero-exit build output', async () => {
  const buildFail = await runBuild({
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
    buildRunner: () => ({
      status: 0,
      stdout: '(!) Some chunks are larger than 500 kB after minification.',
      stderr: '',
    }),
  });

  expect(buildPass.status).toBe(0);
  expect(buildPass.stdout).toContain('Some chunks are larger than 500 kB');
});
