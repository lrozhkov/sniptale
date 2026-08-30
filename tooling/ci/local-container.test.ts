import { expect, it, vi } from 'vitest';

import { runLocalContainerReproduction } from './local-container.mjs';

it('runs the canonical container owner with the exact local workspace identity', () => {
  const commit = 'a'.repeat(40);
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: `${commit}\n` })
    .mockReturnValueOnce({ status: 0 });

  expect(
    runLocalContainerReproduction('release', {
      environment: { PATH: '/usr/bin' },
      root: '/repo',
      run,
    })
  ).toBe(0);
  expect(run).toHaveBeenNthCalledWith(1, 'git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  expect(run).toHaveBeenNthCalledWith(
    2,
    process.execPath,
    ['/repo/tooling/ci/container.mjs', 'release'],
    expect.objectContaining({
      cwd: '/repo',
      env: expect.objectContaining({
        SNIPTALE_CANDIDATE_SHA: commit,
        SNIPTALE_PROOF_SHA: commit,
        SNIPTALE_TRUSTED_CONTROL_SHA: commit,
        SNIPTALE_LOCAL_WORKSPACE: '1',
      }),
      stdio: 'inherit',
    })
  );
});

it('rejects unknown lanes before starting a process', () => {
  expect(() => runLocalContainerReproduction('fast', { run: vi.fn() })).toThrow('Usage');
});
