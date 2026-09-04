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

function findNobleSha2Pattern(rules: DependencyRule[]) {
  const rule = rules.find((candidate) => candidate.name === 'no-non-package-json');
  return rule?.to?.pathNot?.[0];
}

function escapeRegex(source: string) {
  return source.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

it('admits only the resolved installed noble sha2 export in a pushed-range workspace', async () => {
  const workspaceRoot = createTempRoot('dependency-rules-pushed-range-');
  const installedSha2Path = require.resolve('@noble/hashes/sha2.js');
  fs.symlinkSync(
    path.join(process.cwd(), 'node_modules'),
    path.join(workspaceRoot, 'node_modules')
  );
  const rules = await withCwd(workspaceRoot, () => loadRules());
  const pathPattern = findNobleSha2Pattern(rules);

  const pushedRangePath = path.relative(workspaceRoot, installedSha2Path).split(path.sep).join('/');

  expect(pathPattern).toBe(`^${escapeRegex(pushedRangePath)}$`);
  expect(pathPattern).not.toBe('^packages/hostile/node_modules/@noble/hashes/sha2[.]js$');
  expect(pathPattern).not.toBe('^node_modules/@noble/hashes/sha3[.]js$');
  expect(pathPattern).not.toBe('^node_modules/other-package/sha2[.]js$');
});

it('keeps the exception fail-closed when installed dependencies are unavailable', async () => {
  const workspaceRoot = createTempRoot('dependency-rules-without-install-');
  const rules = await withCwd(workspaceRoot, () => loadRules());

  expect(findNobleSha2Pattern(rules)).toBe('(?!)');
});
