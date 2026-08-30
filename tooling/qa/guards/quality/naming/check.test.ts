import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { initGitRepo, runGit, withCwd } from '../../../test-support/test-helpers';

const { collectCodeFilesMock } = vi.hoisted(() => ({
  collectCodeFilesMock: vi.fn(),
}));

vi.mock('../../../analysis/repository/shared-files.mjs', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../analysis/repository/shared-files.mjs')>();
  return {
    ...original,
    collectCodeFiles: collectCodeFilesMock,
  };
});

import { collectNamingViolations, parseSuccessfulGitFileList, runNamingCheck } from './check.mjs';

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
  const file = writeFile(createTempRoot(), 'apps/extension/src/ui/CommandPalette.tsx');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesUseCamelCaseAllowance() {
  const file = writeFile(createTempRoot(), 'apps/extension/src/ui/useHotkey.ts');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesTestScopeExclusion() {
  const file = writeFile(createTempRoot(), 'apps/extension/src/ui/CommandPalette.helpers.test.ts');
  expect(collectNamingViolations([file])).toEqual([]);
}

function verifiesMalformedLowercaseStems() {
  const root = createTempRoot();
  const underscore = writeFile(root, 'apps/extension/src/ui/foo_bar.ts');
  const repeatedHyphen = writeFile(root, 'apps/extension/src/ui/foo--bar.ts');

  expect(collectNamingViolations([underscore, repeatedHyphen])).toEqual([
    expect.objectContaining({ rule: 'filename-naming' }),
    expect.objectContaining({ rule: 'filename-naming' }),
  ]);
}

function verifiesUsePrefixIsNotAHookAllowance() {
  const file = writeFile(createTempRoot(), 'apps/extension/src/ui/userStore.ts');

  expect(collectNamingViolations([file])).toEqual([
    expect.objectContaining({ rule: 'filename-naming' }),
  ]);
}

function verifiesRepeatedPrefixViolationForChangedFiles() {
  const root = createTempRoot();
  const file = writeFile(root, 'apps/extension/src/editor/inspector/inspector-content.tsx');

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/editor/inspector/inspector-content.tsx'),
      rule: 'repeated-prefix-naming',
    }),
  ]);
}

function verifiesThinFacadeAllowanceForRepeatedPrefixRoots() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/inspector-content.tsx',
    "export { EditorInspectorContent } from './content';\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([]);
}

function verifiesDistantAncestorDoesNotCreateRepeatedPrefixDebt() {
  const file = writeFile(createTempRoot(), 'apps/extension/src/content/data-panel/content.tsx');

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([]);
}

function verifiesEmptyAndImportOnlyFilesAreNotFacades() {
  const root = createTempRoot();
  const empty = writeFile(root, 'apps/extension/src/ui/panel/panel-empty.ts', '');
  const importOnly = writeFile(
    root,
    'apps/extension/src/ui/panel/panel-imports.ts',
    "import { value } from './value';\n"
  );

  expect(collectNamingViolations([empty, importOnly], { includeRepeatedPrefix: true })).toEqual([
    expect.objectContaining({ file: expect.stringContaining('panel-empty.ts') }),
    expect.objectContaining({ file: expect.stringContaining('panel-imports.ts') }),
  ]);
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

function verifiesSameNameRecursionInsideImplementation() {
  const file = writeFile(
    createTempRoot(),
    'apps/extension/src/settings/sections/save-presets/preset-actions.ts',
    "export * from './preset-actions';\nexport const implementation = true;\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([
    expect.objectContaining({ rule: 'ambiguous-facade-naming' }),
  ]);
}

function verifiesTestSupportCanImportItsProductionSibling() {
  const file = writeFile(
    createTempRoot(),
    'apps/extension/src/ui/panel/panel.test-support.ts',
    "export { panel } from './panel';\n"
  );

  expect(collectNamingViolations([file], { includeRepeatedPrefix: true })).toEqual([]);
}

async function verifiesRepoWideRepeatedPrefixReporting() {
  const root = createTempRoot();
  writeFile(root, 'package.json', '{"name":"verify-naming-temp"}\n');
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/inspector-content.tsx',
    'export const value = 1;\n'
  );

  collectCodeFilesMock.mockReturnValue([file]);

  expect(runNamingCheck({ repoWide: true }).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'apps/extension/src/editor/inspector/inspector-content.tsx',
        message: expect.stringContaining('repeats owner segment "inspector"'),
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

function verifiesSuccessfulGitOutputSurvivesWorkerSpawnNoise() {
  expect(
    parseSuccessfulGitFileList({
      error: new Error('spawnSync git EPERM'),
      status: 0,
      stdout: 'apps/extension/src/content/example.ts\n',
    })
  ).toEqual(['apps/extension/src/content/example.ts']);
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

function verifiesRepeatedChildIdentitySwap() {
  const root = createTempRoot();
  const runtime = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime/index.ts'
  );
  const runtimeFacade = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime-facade/index.ts'
  );
  const runtimeNext = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime-next/index.ts'
  );
  const runtimePrevious = writeFile(
    root,
    'apps/extension/src/content/selection/example-mode/runtime-previous/index.ts'
  );

  expect(
    collectNamingViolations([runtime, runtimeFacade, runtimeNext], {
      baselineTopologyFiles: [runtime, runtimeFacade, runtimePrevious],
      includeRepeatedPrefix: true,
    })
  ).toEqual([expect.objectContaining({ rule: 'repeated-child-prefix-topology' })]);
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
  it('rejects malformed lowercase filename stems', verifiesMalformedLowercaseStems);
  it('does not treat every use-prefixed word as a hook', verifiesUsePrefixIsNotAHookAllowance);
  it(
    'flags repeated-prefix implementation names for changed files',
    verifiesRepeatedPrefixViolationForChangedFiles
  );
  it('allows thin repeated-prefix facades', verifiesThinFacadeAllowanceForRepeatedPrefixRoots);
  it(
    'does not compare repeated prefixes with distant generic ancestors',
    verifiesDistantAncestorDoesNotCreateRepeatedPrefixDebt
  );
  it(
    'does not classify empty or import-only files as facades',
    verifiesEmptyAndImportOnlyFilesAreNotFacades
  );
  it(
    'rejects same-name facade recursion as a thin facade',
    verifiesSameNameFacadeRecursionIsNotThin
  );
  it(
    'rejects same-name facade recursion beside implementation statements',
    verifiesSameNameRecursionInsideImplementation
  );
  it(
    'allows test-support facades to import their production sibling',
    verifiesTestSupportCanImportItsProductionSibling
  );
  it(
    'reports repeated-prefix implementation names in repo-wide mode',
    verifiesRepoWideRepeatedPrefixReporting
  );
  it(
    'allows manifest-owned entrypoint naming exceptions',
    verifiesManifestOwnedEntrypointException
  );
  it(
    'uses successful git output when a worker reports non-fatal spawn noise',
    verifiesSuccessfulGitOutputSurvivesWorkerSpawnNoise
  );
  it('flags repeated child-prefix owner topology', verifiesRepeatedChildPrefixTopology);
  it('detects equal-count repeated-child identity swaps', verifiesRepeatedChildIdentitySwap);
  it(
    'does not rescan path debt for content-only workspace changes',
    verifiesContentOnlyWorkspaceChangesDoNotRescanPathDebt
  );
  it('still checks added workspace paths', verifiesAddedWorkspacePathsStillEnforceNaming);
});
