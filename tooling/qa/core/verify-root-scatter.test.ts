import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectRootScatterViolations, runRootScatterCheck } from './verify-root-scatter.mjs';

const tempDirs = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-root-scatter-'));
  tempDirs.push(root);
  return root;
}

function writeFile(root, relativePath, content = 'export const value = 1;\n') {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function flagsRetiredSharedRootStyleWrappers() {
  const root = createTempRoot();
  const styles = writeFile(root, 'src/shared/styles.css', "@import './styles/index.css';\n");
  const designTokens = writeFile(
    root,
    'src/shared/design-tokens.css',
    "@import './styles/design-tokens.css';\n"
  );

  expect(collectRootScatterViolations([styles, designTokens], { root })).toEqual([
    expect.objectContaining({
      file: 'src/shared/styles.css',
      rule: 'root-implementation-smell',
    }),
    expect.objectContaining({
      file: 'src/shared/design-tokens.css',
      rule: 'root-implementation-smell',
    }),
  ]);
}

function flagsOwnerLocalTestsInTopLevelSliceRoots() {
  const root = createTempRoot();
  const file = writeFile(root, 'apps/extension/src/popup/bootstrap.test.ts');

  expect(collectRootScatterViolations([file], { root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/popup/bootstrap.test.ts',
      rule: 'root-owner-test-smell',
    }),
  ]);
}

function flagsRootConstantsHelpersFiles() {
  const root = createTempRoot();
  const file = writeFile(root, 'apps/extension/src/scenario-editor/layout.constants.ts');

  expect(collectRootScatterViolations([file], { root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/scenario-editor/layout.constants.ts',
      rule: 'root-constants-helper-smell',
    }),
  ]);
}

function flagsMovedRuntimeRootScatter() {
  const root = createTempRoot();
  const backgroundHelper = writeFile(root, 'apps/extension/src/background/helpers.ts');
  const contentTest = writeFile(root, 'apps/extension/src/content/root.test.ts');

  expect(collectRootScatterViolations([backgroundHelper, contentTest], { root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/background/helpers.ts',
      rule: 'root-constants-helper-smell',
    }),
    expect.objectContaining({
      file: 'apps/extension/src/content/root.test.ts',
      rule: 'root-owner-test-smell',
    }),
  ]);
}

function allowsCanonicalEntrypointRoots() {
  const root = createTempRoot();
  const files = [
    writeFile(root, 'apps/extension/src/background/index.ts'),
    writeFile(root, 'apps/extension/src/content/index.tsx'),
    writeFile(root, 'apps/extension/src/camera-recorder/index.test.tsx'),
    writeFile(root, 'apps/extension/src/offscreen/offscreen.ts'),
    writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.ts'),
    writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html'),
  ];

  expect(collectRootScatterViolations(files, { root })).toEqual([]);
}

function flagsSandboxRootImplementationFiles() {
  const root = createTempRoot();
  const file = writeFile(root, 'apps/extension/src/effect-runtime-sandbox/worker-runtime.ts');

  expect(collectRootScatterViolations([file], { root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/effect-runtime-sandbox/worker-runtime.ts',
      rule: 'root-implementation-smell',
    }),
  ]);
}

function allowsTestHarnessRootFiles() {
  const root = createTempRoot();
  const file = writeFile(root, 'tooling/test/harness/popup.tsx');

  expect(collectRootScatterViolations([file], { root })).toEqual([]);
}

function flagsRetiredRootFiles() {
  const root = createTempRoot();
  const scriptsFile = writeFile(root, 'scripts/release/package-dist.mjs');
  const testsFile = writeFile(root, 'tests/e2e/example.spec.ts');
  const harnessFile = writeFile(root, 'src/test-harness/popup.tsx');
  const retiredRuntimeFiles = [
    'src/background/index.ts',
    'src/content/index.tsx',
    'src/editor/index.tsx',
    'src/offscreen/offscreen.ts',
    'src/effect-runtime-sandbox/index.html',
    'src/scenario-editor/index.tsx',
    'src/video-editor/index.tsx',
  ];
  const retiredRuntimes = retiredRuntimeFiles.map((file) => writeFile(root, file));

  expect(
    collectRootScatterViolations([scriptsFile, testsFile, harnessFile, ...retiredRuntimes], {
      root,
    })
  ).toEqual([
    expect.objectContaining({
      file: 'scripts/release/package-dist.mjs',
      rule: 'retired-root-owner-smell',
    }),
    expect.objectContaining({
      file: 'tests/e2e/example.spec.ts',
      rule: 'retired-root-owner-smell',
    }),
    expect.objectContaining({
      file: 'src/test-harness/popup.tsx',
      rule: 'retired-root-owner-smell',
    }),
    ...retiredRuntimeFiles.map((file) =>
      expect.objectContaining({ file, rule: 'retired-root-owner-smell' })
    ),
  ]);
}

function reportsRepoWideRetiredSharedRootStyleWrappers() {
  const root = createTempRoot();
  writeFile(root, 'apps/extension/src/popup/bootstrap.test.ts');
  writeFile(root, 'src/shared/styles.css', "@import './styles/index.css';\n");

  expect(runRootScatterCheck({ repoWide: true, root }).violations).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/popup/bootstrap.test.ts',
      rule: 'root-owner-test-smell',
    }),
    expect.objectContaining({
      file: 'src/shared/styles.css',
      rule: 'root-implementation-smell',
    }),
  ]);
}

describe('collectRootScatterViolations', () => {
  it('flags retired shared root style wrappers', flagsRetiredSharedRootStyleWrappers);
  it('flags owner-local tests in top-level slice roots', flagsOwnerLocalTestsInTopLevelSliceRoots);
  it('flags root constants/helpers files', flagsRootConstantsHelpersFiles);
  it('flags moved privileged runtime root scatter', flagsMovedRuntimeRootScatter);
  it('allows canonical entrypoint roots', allowsCanonicalEntrypointRoots);
  it('flags sandbox root implementation files', flagsSandboxRootImplementationFiles);
  it('allows test-harness root files', allowsTestHarnessRootFiles);
  it('flags retired root files', flagsRetiredRootFiles);
  it(
    'reports repo-wide retired shared root style wrappers',
    reportsRepoWideRetiredSharedRootStyleWrappers
  );
});
