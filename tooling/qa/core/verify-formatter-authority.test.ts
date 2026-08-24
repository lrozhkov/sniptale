import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps Oxfmt as the sole formatter configuration authority', () => {
  expect(fs.existsSync('.prettierrc.json')).toBe(false);
  expect(fs.existsSync('.prettierignore')).toBe(false);
  expect(fs.existsSync('tooling/qa/core/verify-prettier.mjs')).toBe(false);
  expect(fs.existsSync('tooling/qa/core/verify-formatter.mjs')).toBe(false);

  const config = JSON.parse(fs.readFileSync('.oxfmtrc.json', 'utf8')) as unknown;
  expect(config).toEqual({
    ignorePatterns: [],
    printWidth: 100,
    semi: true,
    singleQuote: true,
    sortPackageJson: false,
    trailingComma: 'es5',
  });
  const ignored = fs.readFileSync('.oxfmtignore', 'utf8').trim().split(/\r?\n/u);
  expect(ignored).toEqual(
    expect.arrayContaining([
      'package-lock.json',
      'tooling/configs/',
      'packages/runtime-contracts/src/effect-v1/fixtures/sniptale-effect-v1.schema.json',
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
      '*.md',
    ])
  );
});

it('keeps style policy in Oxfmt config instead of duplicate wrapper flags', () => {
  const source = fs.readFileSync('tooling/qa/core/verify-oxfmt.mjs', 'utf8');
  expect(source).toContain("'--config=.oxfmtrc.json'");
  expect(source).toContain("'--disable-nested-config'");
  expect(source).not.toMatch(/--print-width|--single-quote|--trailing-comma/u);
});
