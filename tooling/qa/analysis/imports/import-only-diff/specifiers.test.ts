import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

async function loadModule(root: string) {
  return withCwd(root, () =>
    importFresh<typeof import('./check.mjs')>('./check.mjs', import.meta.url)
  );
}

function commitBaseline(root: string) {
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
}

it('detects dynamic import specifier rewrites as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-dynamic-import-');
  initGitRepo(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      'export function start(): void {',
      "  void import('../shared/message-tracer').then(({ initTracer }) => initTracer('popup'));",
      '}',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      'export function start(): void {',
      "  void import('../shared/platform/message-tracer').then(({ initTracer }) => initTracer('popup'));",
      '}',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/runtime.ts');
  });

  expect(result).toBe(true);
});

it('detects nested mock specifier rewrites as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-nested-mock-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "it('uses a nested mock', async () => {",
      "  vi.doMock('../shared/i18n', () => ({ translate: (key: string) => key }));",
      "  expect((await import('./subject')).value).toBeTruthy();",
      '});',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "it('uses a nested mock', async () => {",
      "  vi.doMock('../shared/platform/i18n', () => ({ translate: (key: string) => key }));",
      "  expect((await import('./subject')).value).toBeTruthy();",
      '});',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOrMockOnlyDiffFile('src/example.test.ts');
  });

  expect(result).toBe(true);
});

it.each([
  {
    name: 'changed prefix operator',
    before: 'export function read(value: number) { return +value; }',
    after: 'export function read(value: number) { return -value; }',
    expected: false,
  },
  {
    name: 'changed postfix operator',
    before: 'export function read(value: number) { return value++; }',
    after: 'export function read(value: number) { return value--; }',
    expected: false,
  },
  {
    name: 'changed export assignment kind',
    before: 'const value = 1; export = value;',
    after: 'const value = 1; export default value;',
    expected: false,
  },
  {
    name: 'changed raw tagged template escape',
    before: 'export const message = String.raw`\\n`;',
    after: 'export const message = String.raw`\n`;',
    expected: false,
  },
  {
    name: 'changed raw tagged template span escape',
    before: 'export const message = String.raw`head${1}\\n`;',
    after: 'export const message = String.raw`head${1}\n`;',
    expected: false,
  },
  {
    name: 'changed variable binding kind',
    before: "export const value = import('./old');",
    after: "export let value = import('./new');",
    expected: false,
  },
  {
    name: 'changed JSX whitespace',
    before: 'export const view = <span>a b</span>;',
    after: 'export const view = <span>a  b</span>;',
    expected: false,
  },
  {
    name: 'changed template text containing import syntax',
    before: "export const message = `import('./old')`;",
    after: "export const message = `import('./new')`;",
    expected: false,
  },
  {
    name: 'changed nested mock implementation',
    before: "export function read() { vi.doMock('./old', () => ({ value: 1 })); }",
    after: "export function read() { vi.doMock('./new', () => ({ value: 2 })); }",
    expected: false,
  },
  {
    name: 'changed pragma comment',
    before: '// @vitest-environment jsdom\nexport const value = 1;',
    after: '// @vitest-environment node\nexport const value = 1;',
    expected: false,
  },
  {
    name: 'destructured import after a formatter line break',
    before:
      "export async function read() { const { create } = await import('./short'); return create(1); }",
    after:
      "export async function read() { const { create } =\n await import('./longer/owner/module'); return create(1); }",
    expected: true,
  },
  {
    name: 'member import with multiline parentheses',
    before: "export async function read() { return (await import('./short')).create(1); }",
    after:
      "export async function read() { return (\n await import('./longer/owner/module')\n ).create(1); }",
    expected: true,
  },
  {
    name: 'changed runtime argument beside a formatted import',
    before: "export async function read() { return (await import('./short')).create(1); }",
    after:
      "export async function read() { return (\n await import('./longer/owner/module')\n ).create(2); }",
    expected: false,
  },
  {
    name: 'changed assertion beside a formatted import',
    before:
      "export async function read() { const value = await import('./short'); expect(value).toBe(1); }",
    after:
      "export async function read() { const value =\n await import('./longer/owner/module'); expect(value).toBe(2); }",
    expected: false,
  },
  {
    name: 'ordinary string containing import syntax',
    before: `export const message = "import('./old')";`,
    after: `export const message = "import('./new')";`,
    expected: false,
  },
  {
    name: 'ordinary string containing mock syntax',
    before: `export const message = "vi.mock('./old')";`,
    after: `export const message = "vi.mock('./new')";`,
    expected: false,
  },
])('classifies $name without hiding behavior', async ({ before, after, expected }) => {
  const root = createTempRoot('import-only-formatted-specifier-');
  initGitRepo(root);
  writeFile(root, 'src/subject.tsx', `${before}\n`);
  commitBaseline(root);
  writeFile(root, 'src/subject.tsx', `${after}\n`);
  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return {
      importOnly: module.isImportOnlyDiffFile('src/subject.tsx'),
      importOrMockOnly: module.isImportOrMockOnlyDiffFile('src/subject.tsx'),
    };
  });
  expect(result).toEqual({ importOnly: expected, importOrMockOnly: expected });
});
