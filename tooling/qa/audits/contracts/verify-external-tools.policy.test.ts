import KNIP_CONFIG from '../../../configs/qa/knip.json';

import { expect, it } from 'vitest';

const KNIP_CATEGORIES = ['unlisted', 'binaries', 'unresolved'];

it('maps every supported knip issue category', async () => {
  const module = await import('../knip/knip.mjs');
  const result = module.runKnipCheck({
    executable: 'knip',
    runCommandImpl: () => ({
      status: 1,
      stdout: JSON.stringify({
        issues: [
          {
            file: 'package.json',
            ...Object.fromEntries(KNIP_CATEGORIES.map((key) => [key, [{ name: key }]])),
          },
        ],
      }),
      stderr: '',
    }),
  });

  expect(result.violations.map((violation) => violation.rule)).toEqual(
    KNIP_CATEGORIES.map((category) => `knip-${category}`)
  );
});

it('rejects unknown non-empty knip issue categories', async () => {
  const module = await import('../knip/knip.mjs');

  expect(() =>
    module.runKnipCheck({
      executable: 'knip',
      runCommandImpl: () => ({
        status: 1,
        stdout: JSON.stringify({ issues: [{ file: 'package.json', futureIssues: ['x'] }] }),
        stderr: '',
      }),
    })
  ).toThrow('unsupported issue categories: futureIssues');
});

it('keeps the native knip config within the authoritative audit scope', () => {
  const config = KNIP_CONFIG;

  expect(config).not.toHaveProperty('$comment');
  expect(config.entry).not.toContain('src/**/*.{ts,tsx,js,mjs,cjs}');
  expect(config.project).not.toContain('src/**/*.{ts,tsx,js,mjs,cjs}');
  expect(config.include).toEqual(['unresolved', 'unlisted', 'binaries']);
  expect(config.ignoreBinaries).toEqual([
    'codeql',
    'fc-query',
    'flock',
    'gcc',
    'import',
    'mkfifo',
    'printf',
    'xwininfo',
  ]);
  expect(config.ignore).not.toContain('tooling/test/e2e/**');
});
