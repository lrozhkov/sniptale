import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

async function collectSuccessors(
  root: string,
  productionTargetFiles: string[],
  productionCodeFiles: string[]
) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./deleted-closure.mjs')>(
      './deleted-closure.mjs',
      import.meta.url
    );
    return module.collectDeletedTargetSuccessors({
      productionTargetFiles,
      productionCodeFiles,
    });
  });
}

const DELEGATE_FIXTURES = [
  {
    accepted: true,
    file: 'allowed.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(response: string, _tree: unknown) { return parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'async-await.ts',
    source: [
      "import { parse } from './provider';",
      'export async function parseJson(response: string) { return await parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'async-direct.ts',
    source: [
      "import { parse } from './provider';",
      'export async function parseJson(response: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'defaulted.ts',
    source: [
      "import { parse } from './provider';",
      "export function parseJson(response = 'fallback') { return parse(response); }",
      '',
    ].join('\n'),
  },
  {
    file: 'initializer.ts',
    source: [
      "import { parse } from './provider';",
      "import { register } from './registry';",
      'export const registration = register();',
      'export function parseJson(response: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
  { file: 'nonlocal.ts', source: "export { parse } from '@example/parser';\n" },
  {
    file: 'optional-call.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(response: string) { return parse?.(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'optional-parameter.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(response?: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'reordered.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(first: string, second: string) { return parse(second, first); }',
      '',
    ].join('\n'),
  },
  {
    file: 'rest-parameter.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(...responses: string[]) { return parse(...responses); }',
      '',
    ].join('\n'),
  },
  {
    file: 'side-effect-import.ts',
    source: [
      "import { parse } from './provider';",
      "import './registry';",
      'export function parseJson(response: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'top-level-class.ts',
    source: [
      "import { parse } from './provider';",
      'export class ParserFacade {}',
      'export function parseJson(response: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
  {
    file: 'transformed.ts',
    source: [
      "import { parse } from './provider';",
      'export function parseJson(response: string) { return parse(response.trim()); }',
      '',
    ].join('\n'),
  },
  {
    file: 'unrelated-import.ts',
    source: [
      "import { parse } from './provider';",
      "import { register } from './registry';",
      'export function parseJson(response: string) { return parse(response); }',
      '',
    ].join('\n'),
  },
];

it('accepts only direct parameter-preserving delegates as deleted adapters', async () => {
  const root = createTempRoot('build-deleted-strict-adapters-');
  const ownerRoot = 'apps/extension/src/content/parser/example';
  const provider = `${ownerRoot}/provider.ts`;
  const registry = `${ownerRoot}/registry.ts`;
  const wrappers = DELEGATE_FIXTURES.map((fixture) => `${ownerRoot}/${fixture.file}`);
  initGitRepo(root);
  writeFile(root, provider, 'export const parse = (...args: unknown[]) => args;\n');
  writeFile(root, provider.replace(/\.ts$/u, '.test.ts'), "it('covers provider', () => {});\n");
  writeFile(root, registry, 'export const register = () => true;\n');
  writeFile(root, registry.replace(/\.ts$/u, '.test.ts'), "it('covers registry', () => {});\n");
  for (const fixture of DELEGATE_FIXTURES) {
    writeFile(root, `${ownerRoot}/${fixture.file}`, fixture.source);
  }
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', ...wrappers);

  const successors = await collectSuccessors(root, wrappers, []);

  expect(successors.get(`${ownerRoot}/allowed.ts`)).toEqual({
    files: [provider],
    proofKind: 'aggregate-providers',
  });
  for (const fixture of DELEGATE_FIXTURES.filter((candidate) => !candidate.accepted)) {
    expect(successors.has(`${ownerRoot}/${fixture.file}`)).toBe(false);
  }
});

it('rejects aggregate provider sets that are over the bound or lack owner proof', async () => {
  const root = createTempRoot('build-deleted-provider-proof-');
  const ownerRoot = 'apps/extension/src/content/parser/example';
  const boundedFacade = `${ownerRoot}/bounded.ts`;
  const untestedFacade = `${ownerRoot}/untested.ts`;
  const providers = Array.from({ length: 13 }, (_, index) => `${ownerRoot}/provider-${index}.ts`);
  const untestedProvider = `${ownerRoot}/untested-provider.ts`;
  initGitRepo(root);
  for (const [index, provider] of providers.entries()) {
    writeFile(root, provider, `export const value${index} = ${index};\n`);
    writeFile(root, provider.replace(/\.ts$/u, '.test.ts'), "it('covers provider', () => {});\n");
  }
  writeFile(root, untestedProvider, 'export const untested = true;\n');
  writeFile(
    root,
    boundedFacade,
    `${providers.map((_, index) => `export { value${index} } from './provider-${index}';`).join('\n')}\n`
  );
  writeFile(
    root,
    untestedFacade,
    "export { value0 } from './provider-0';\nexport { untested } from './untested-provider';\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', boundedFacade, untestedFacade);

  const successors = await collectSuccessors(root, [boundedFacade, untestedFacade], []);

  expect(successors.has(boundedFacade)).toBe(false);
  expect(successors.has(untestedFacade)).toBe(false);
});

it('rejects deleted dependencies and cycles in aggregate provider graphs', async () => {
  const root = createTempRoot('build-deleted-provider-graph-');
  const ownerRoot = 'apps/extension/src/content/parser/example';
  const missingFacade = `${ownerRoot}/missing-facade.ts`;
  const cycleA = `${ownerRoot}/cycle-a.ts`;
  const cycleB = `${ownerRoot}/cycle-b.ts`;
  initGitRepo(root);
  writeFile(root, missingFacade, "export { missing } from './missing-provider';\n");
  writeFile(root, cycleA, "export { valueB } from './cycle-b';\n");
  writeFile(root, cycleB, "export { valueA } from './cycle-a';\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', missingFacade, cycleA, cycleB);

  const deletedFiles = [missingFacade, cycleA, cycleB];
  const successors = await collectSuccessors(root, deletedFiles, []);

  for (const file of deletedFiles) expect(successors.has(file)).toBe(false);
});
