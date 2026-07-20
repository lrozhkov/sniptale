import { expect, it } from 'vitest';

import { importFresh } from './test-helpers';

it('uses the wrapper coverage profile when the wrapper env is set', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'diff';
  process.env.SNIPTALE_VITEST_COVERAGE_TARGETS = JSON.stringify([
    'src/shared/example.ts',
    'apps/extension/src/background/example.ts',
  ]);
  process.env.SNIPTALE_VITEST_TIMEOUT_MODE = 'wrapper';

  const module = await importFresh<typeof import('../../../vitest.config.ts')>(
    '../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    all: false,
    reporter: ['json'],
    include: ['src/shared/example.ts', 'apps/extension/src/background/example.ts'],
  });
  expect(module.default.test?.testTimeout).toBe(15000);
  expect(module.default.test?.hookTimeout).toBe(15000);
  expect(module.default.test?.include).toEqual([
    'apps/extension/src/**/*.{test,spec}.{ts,tsx}',
    'packages/*/src/**/*.{test,spec}.{ts,tsx}',
  ]);
});

it('uses the full wrapper coverage profile when full wrapper coverage is requested', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'full';
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;

  const module = await importFresh<typeof import('../../../vitest.config.ts')>(
    '../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    all: false,
    reporter: ['json'],
    include: ['apps/extension/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
  });
});

it('uses harness includes when the harness suite is requested', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'harness';
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;

  const module = await importFresh<typeof import('../../../vitest.config.ts')>(
    '../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.include).toEqual(['tooling/**/*.{test,spec}.{ts,tsx}']);
  expect(module.default.test?.exclude).toContain('tooling/test/e2e/**/*.spec.ts');
  expect(module.default.test?.coverage).toMatchObject({
    include: ['tooling/**/*.{ts,tsx}'],
  });
});

it('keeps the rich manual coverage profile by default', async () => {
  delete process.env.SNIPTALE_VITEST_SUITE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;

  const module = await importFresh<typeof import('../../../vitest.config.ts')>(
    '../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    all: true,
    reporter: ['text', 'json-summary', 'json', 'html'],
    include: [
      'apps/extension/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tooling/**/*.{ts,tsx}',
    ],
  });
});
