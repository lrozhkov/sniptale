import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { initGitRepo, runGit, withCwd } from './test-helpers';

const { collectCodeFilesMock } = vi.hoisted(() => ({
  collectCodeFilesMock: vi.fn(),
}));

vi.mock('./shared.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('./shared.mjs')>();
  return {
    ...original,
    collectCodeFiles: collectCodeFilesMock,
  };
});

import { collectNamingViolations, runNamingCheck } from './verify-naming.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, content = 'export const demo = true;\n') {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-naming-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  collectCodeFilesMock.mockReset();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function verifiesMixedCaseTsViolation() {
  const file = writeFile(
    createTempRoot(),
    'apps/extension/src/content/overlay/state/frameUIStore.ts'
  );

  expect(collectNamingViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/content/overlay/state/frameUIStore.ts'),
      rule: 'filename-naming',
    }),
  ]);
}

function verifiesTsxExclusion() {
  const file = writeFile(createTempRoot(), 'src/shared/ui/CommandPalette.tsx');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesUseCamelCaseAllowance() {
  const file = writeFile(createTempRoot(), 'src/shared/ui/hotkey.ts');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesTestScopeExclusion() {
  const file = writeFile(createTempRoot(), 'src/shared/ui/CommandPalette.helpers.test.ts');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesRepeatedPrefixViolationForChangedFiles() {
  const root = createTempRoot();
  const file = writeFile(root, 'apps/extension/src/editor/inspector/editor-inspector-content.tsx');

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([
    expect.objectContaining({
      file: expect.stringContaining(
        'apps/extension/src/editor/inspector/editor-inspector-content.tsx'
      ),
      rule: 'repeated-prefix-naming',
    }),
  ]);
}

function verifiesThinFacadeAllowanceForRepeatedPrefixRoots() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/editor-inspector-content.tsx',
    "export { EditorInspectorContent } from './content';\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([]);
}

function verifiesSameNameFacadeRecursionIsNotThin() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/settings/sections/save-presets/preset-actions.ts',
    "export * from './preset-actions';\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([
    expect.objectContaining({
      file: expect.stringContaining(
        'apps/extension/src/settings/sections/save-presets/preset-actions.ts'
      ),
      rule: 'ambiguous-facade-naming',
    }),
  ]);
}

async function verifiesRepoWideRepeatedPrefixReporting() {
  const root = createTempRoot();
  writeFile(root, 'package.json', '{"name":"verify-naming-temp"}\n');
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/editor-inspector-content.tsx',
    'export const value = 1;\n'
  );

  collectCodeFilesMock.mockReturnValue([file]);

  expect(runNamingCheck({ repoWide: true }).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'apps/extension/src/editor/inspector/editor-inspector-content.tsx',
        message: expect.stringContaining('repeats owner segment "editor"'),
        rule: 'repeated-prefix-naming',
      }),
    ])
  );
}

function verifiesManifestOwnedEntrypointException() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/offscreen/offscreen.ts',
    "import { bootstrap } from './runtime/bootstrap';\nbootstrap();\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([]);
}

function verifiesRepeatedChildPrefixTopology() {
  const root = createTempRoot();
  const runtime = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime/index.ts'
  );
  const runtimeFacade = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime-facade/index.ts'
  );
  const runtimeSetup = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime-setup/index.ts'
  );
  const unrelated = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/session/index.ts'
  );

  expect(
    collectNamingViolations([runtime, runtimeFacade, runtimeSetup, unrelated], {
      includeRepeatedPrefix: true,
    })
  ).toEqual([
    expect.objectContaining({
      file: expect.stringContaining(
        'apps/extension/src/content/selection/example-mode/runtime/index.ts'
      ),
      message: expect.stringContaining('repeated child prefix "runtime"'),
      rule: 'repeated-child-prefix-topology',
    }),
  ]);
}

async function verifiesContentOnlyWorkspaceChangesDoNotRescanPathDebt() {
  const root = createTempRoot();
  initGitRepo(root);
  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/icons/icons.ts',
    'export const value = 1;\n'
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(root, 'apps/extension/src/content/overlay/icons/icons.ts', 'export const value = 2;\n');
  collectCodeFilesMock.mockReturnValue([file]);

  const result = await withCwd(root, () => runNamingCheck({ files: [file], scope: 'workspace' }));

  expect(result.violations).toEqual([]);
}

async function verifiesAddedWorkspacePathsStillEnforceNaming() {
  const root = createTempRoot();
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"naming-workspace"}\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/icons/icons.ts',
    'export const value = 1;\n'
  );
  collectCodeFilesMock.mockReturnValue([file]);

  const result = await withCwd(root, () => runNamingCheck({ files: [file], scope: 'workspace' }));

  expect(result.violations).toEqual([expect.objectContaining({ rule: 'repeated-prefix-naming' })]);
}

describe('collectNamingViolations', () => {
  it('flags mixed-case non-TSX production filenames', verifiesMixedCaseTsViolation);
  it('ignores TSX files in the current narrow rollout', verifiesTsxExclusion);
  it('allows useCamelCase hook-style modules', verifiesUseCamelCaseAllowance);
  it('ignores test-only scopes', verifiesTestScopeExclusion);
  it(
    'flags repeated-prefix implementation names for changed files',
    verifiesRepeatedPrefixViolationForChangedFiles
  );
  it('allows thin repeated-prefix facades', verifiesThinFacadeAllowanceForRepeatedPrefixRoots);
  it(
    'rejects same-name facade recursion as a thin facade',
    verifiesSameNameFacadeRecursionIsNotThin
  );
  it(
    'reports repeated-prefix implementation names in repo-wide mode',
    verifiesRepoWideRepeatedPrefixReporting
  );
  it(
    'allows manifest-owned entrypoint naming exceptions',
    verifiesManifestOwnedEntrypointException
  );
  it('flags repeated child-prefix owner topology', verifiesRepeatedChildPrefixTopology);
  it(
    'does not rescan path debt for content-only workspace changes',
    verifiesContentOnlyWorkspaceChangesDoNotRescanPathDebt
  );
  it('still checks added workspace paths', verifiesAddedWorkspacePathsStillEnforceNaming);
});
