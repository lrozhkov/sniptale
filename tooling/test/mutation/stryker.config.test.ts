import { afterEach, expect, it, vi } from 'vitest';

import { importFresh } from '../../qa/test-support/test-helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('keeps repository-local generated artifacts out of every mutation sandbox', async () => {
  vi.stubEnv('SNIPTALE_MUTATION_PROFILE', 'persistence');
  vi.stubEnv('SNIPTALE_MUTATION_RESULT_FILE', '.tmp/mutation/test/report.json');
  const config = (
    await importFresh<typeof import('./stryker.config.mjs')>(
      './stryker.config.mjs',
      import.meta.url
    )
  ).default;

  expect(config.ignorePatterns).toEqual(
    expect.arrayContaining([
      '.tmp/**',
      '.backup/**',
      '.playwright-browsers/**',
      'build/**',
      'dist*/**',
      'tasks/**',
    ])
  );
});
