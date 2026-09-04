import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, withCwd } from '../../test-support/test-helpers';

type DependencyRule = {
  name: string;
  to?: {
    pathNot?: string[];
  };
};

const require = createRequire(import.meta.url);
const rulesPath = require.resolve('./dependency-cruiser-default-rules.cjs');

function loadRules() {
  delete require.cache[rulesPath];
  return require(rulesPath) as DependencyRule[];
}

it('admits only the resolved installed noble sha2 export in a pushed-range workspace', async () => {
  const workspaceRoot = createTempRoot('dependency-rules-pushed-range-');
  const installedSha2Path = require.resolve('@noble/hashes/sha2.js');
  fs.symlinkSync(
    path.join(process.cwd(), 'node_modules'),
    path.join(workspaceRoot, 'node_modules')
  );
  const rules = await withCwd(workspaceRoot, () => loadRules());
  const rule = rules.find((candidate) => candidate.name === 'no-non-package-json');
  const pathPattern = rule?.to?.pathNot?.find((pattern) => pattern.includes('@noble/hashes'));

  expect(pathPattern).toBeDefined();
  const allowedPath = new RegExp(pathPattern!);
  const pushedRangePath = path.relative(workspaceRoot, installedSha2Path).split(path.sep).join('/');

  expect(allowedPath.test(pushedRangePath)).toBe(true);
  expect(allowedPath.test('packages/hostile/node_modules/@noble/hashes/sha2.js')).toBe(false);
  expect(allowedPath.test('node_modules/@noble/hashes/sha3.js')).toBe(false);
  expect(allowedPath.test('node_modules/other-package/sha2.js')).toBe(false);
});
