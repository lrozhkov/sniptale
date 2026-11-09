import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';
import { cruise, type IRegularForbiddenRuleType } from 'dependency-cruiser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

import { createTempRoot, withCwd, writeFile } from '../../test-support/test-helpers';

type DependencyRule = IRegularForbiddenRuleType & {
  name: string;
  to: IRegularForbiddenRuleType['to'] & { pathNot?: string[] };
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

function installIndexedDbTypesFixture(root: string) {
  const main = require.resolve('fake-indexeddb');
  const installed = path.resolve(path.dirname(main), '../..');
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(installed, 'package.json'), 'utf8')
  );
  if (!isRecord(manifest) || !isRecord(manifest['exports']))
    throw new Error('Installed fake IndexedDB manifest has no declared exports.');
  const target = path.join(root, 'node_modules/fake-indexeddb');
  fs.mkdirSync(path.join(target, 'build/cjs'), { recursive: true });
  fs.writeFileSync(
    path.join(target, 'package.json'),
    JSON.stringify({
      ...manifest,
      exports: { ...manifest['exports'], './other': { types: './other.d.ts' } },
    })
  );
  fs.copyFileSync(main, path.join(target, 'build/cjs/index.js'));
  fs.copyFileSync(path.join(installed, 'types.d.ts'), path.join(target, 'types.d.ts'));
  fs.writeFileSync(path.join(target, 'other.d.ts'), 'export {};\n');
}

it('admits only the declared installed fake IndexedDB types export', async () => {
  const workspaceRoot = createTempRoot('dependency-rules-indexed-db-types-');
  installIndexedDbTypesFixture(workspaceRoot);
  installIndexedDbTypesFixture(path.join(workspaceRoot, 'packages/hostile'));
  writeFile(
    workspaceRoot,
    'entry.mjs',
    "import 'fake-indexeddb'; import 'fake-indexeddb/other';\n"
  );
  writeFile(workspaceRoot, 'packages/hostile/entry.mjs', "import 'fake-indexeddb';\n");
  const graph = await withCwd(workspaceRoot, async () => {
    const rule = loadRules().find((candidate) => candidate.name === 'no-non-package-json');
    if (!rule) throw new Error('Missing installed-package dependency rule.');
    const result = await cruise(
      ['entry.mjs', 'packages/hostile/entry.mjs'],
      {
        validate: true,
        ruleSet: { forbidden: [rule] },
        outputType: 'json',
        doNotFollow: { path: 'node_modules' },
      },
      {
        exportsFields: ['exports'],
        conditionNames: ['types', 'import', 'require', 'default'],
        bustTheCache: true,
      }
    );
    const output: unknown =
      typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
    if (!isRecord(output) || !Array.isArray(output['modules']) || !isRecord(output['summary']))
      throw new Error('Dependency-cruiser did not return its resolved graph.');
    return output;
  });
  expect(graph['modules']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'entry.mjs',
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            resolved: 'node_modules/fake-indexeddb/types.d.ts',
            dependencyTypes: expect.arrayContaining(['npm-unknown']),
            couldNotResolve: false,
            valid: true,
          }),
        ]),
      }),
    ])
  );
  const summary = graph['summary'];
  if (!isRecord(summary)) throw new Error('Dependency-cruiser summary is missing.');
  expect(summary['violations']).toEqual([
    expect.objectContaining({
      to: 'node_modules/fake-indexeddb/other.d.ts',
      dependencyTypes: expect.arrayContaining(['npm-unknown']),
      rule: { severity: 'error', name: 'no-non-package-json' },
    }),
    expect.objectContaining({
      to: 'packages/hostile/node_modules/fake-indexeddb/types.d.ts',
      dependencyTypes: expect.arrayContaining(['npm-unknown']),
      rule: { severity: 'error', name: 'no-non-package-json' },
    }),
  ]);
});

it('keeps the fake IndexedDB export exception closed without an installed package', async () => {
  const workspaceRoot = createTempRoot('dependency-rules-indexed-db-missing-');
  const rules = await withCwd(workspaceRoot, () => loadRules());
  expect(
    rules.find((candidate) => candidate.name === 'no-non-package-json')?.to?.pathNot?.[1]
  ).toBe('(?!)');
});
