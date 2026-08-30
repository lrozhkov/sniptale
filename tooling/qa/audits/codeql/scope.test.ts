import fs from 'node:fs';

import { expect, it } from 'vitest';

import { isCodeqlProductionSourcePath } from './codeql-proof.mjs';
import { assertCodeqlConfigIsFresh, readCodeqlProofPolicy } from './config.mjs';

it('keeps production classification inside the exact configured CodeQL roots', () => {
  const policy = readCodeqlProofPolicy();

  expect(isCodeqlProductionSourcePath('apps/extension/src/product.ts', policy)).toBe(true);
  expect(isCodeqlProductionSourcePath('tooling/ci/container.mjs', policy)).toBe(true);
  for (const file of [
    'src/legacy.ts',
    'tooling/examples/outside-codeql-scope.ts',
    'apps/extension/src/product.test.ts',
    'packages/example/fixtures/input.ts',
  ]) {
    expect(isCodeqlProductionSourcePath(file, policy), file).toBe(false);
  }
});

it('keeps every configured root present, non-vacuous, non-overlapping, and reflected in config', () => {
  const policy = readCodeqlProofPolicy();
  for (const root of policy.sourceRoots) expect(fs.statSync(root).isDirectory(), root).toBe(true);
  expect(() => assertCodeqlConfigIsFresh()).not.toThrow();
});
