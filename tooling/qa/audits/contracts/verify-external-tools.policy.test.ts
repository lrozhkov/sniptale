import fs from 'node:fs';

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
  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/knip.json', 'utf8'));

  expect(config).not.toHaveProperty('$comment');
  expect(config.entry).not.toContain('src/**/*.{ts,tsx,js,mjs,cjs}');
  expect(config.project).not.toContain('src/**/*.{ts,tsx,js,mjs,cjs}');
  expect(config.include).toEqual(['unresolved', 'unlisted', 'binaries']);
  expect(config.ignoreBinaries).toEqual(['codeql', 'gcc', 'printf']);
  expect(config.ignore).not.toContain('tooling/test/e2e/**');
});
