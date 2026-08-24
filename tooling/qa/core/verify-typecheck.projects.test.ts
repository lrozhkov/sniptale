import path from 'node:path';

import { expect, it } from 'vitest';
import ts from 'typescript';

import {
  OWNER_TEST_TYPECHECK_PROJECTS,
  PRODUCTION_TYPECHECK_PROJECTS,
  TEST_HARNESS_TYPECHECK_PROJECT,
} from './typecheck-project-definitions.mjs';
import { createProjectConfig } from './verify-typecheck.mjs';

const REPO_ROOT = '../../../../..';

function repoPath(path: string): string {
  return `${REPO_ROOT}/${path}`;
}

function collectRootFiles(project: Parameters<typeof createProjectConfig>[0]): string[] {
  const configDir = path.resolve('.tmp/qa/typecheck/projects', project.id);
  const parsed = ts.parseJsonConfigFileContent(createProjectConfig(project), ts.sys, configDir);
  return parsed.fileNames.map((file) => path.relative(process.cwd(), file).replaceAll('\\', '/'));
}

it('keeps test fixtures out of production typecheck projects', () => {
  const editorProject = PRODUCTION_TYPECHECK_PROJECTS.find((project) => project.id === 'editor');
  expect(editorProject).toBeDefined();

  const config = createProjectConfig(editorProject!);
  expect(config.exclude).toContain(repoPath('apps/extension/src/**/test-fixtures*'));
  expect(config.exclude).toContain(repoPath('packages/platform/src/**/test-fixtures*'));
  expect(config.compilerOptions).not.toHaveProperty('composite');
  expect(config.files).toContain(`${REPO_ROOT}/apps/extension/src/vite-env.d.ts`);
  expect(config.files).toContain(`${REPO_ROOT}/packages/ui/src/styles/imports.d.ts`);
  expect(config.files).toContain(
    `${REPO_ROOT}/packages/runtime-contracts/src/video/messages/index.literals.d.ts`
  );
  expect(config.files).toContain(
    `${REPO_ROOT}/packages/runtime-contracts/src/video/types/types.literals.d.ts`
  );
  expect(config.files).toContain(
    `${REPO_ROOT}/packages/runtime-contracts/src/messaging/message-types/literals.d.ts`
  );
});

it('keeps app ambient declarations out of package typecheck projects', () => {
  const foundationProject = PRODUCTION_TYPECHECK_PROJECTS.find(
    (project) => project.id === 'foundation-package'
  );
  expect(foundationProject).toBeDefined();

  const config = createProjectConfig(foundationProject!);
  expect(config.files).not.toContain(`${REPO_ROOT}/apps/extension/src/vite-env.d.ts`);
  expect(config.files).not.toContain(`${REPO_ROOT}/packages/ui/src/styles/imports.d.ts`);
  expect(config.files).not.toContain(
    `${REPO_ROOT}/packages/runtime-contracts/src/video/messages/index.literals.d.ts`
  );
  expect(config.compilerOptions.types).not.toContain('node');
});

it('includes Node globals in package test projects', () => {
  const foundationTestsProject = OWNER_TEST_TYPECHECK_PROJECTS.find(
    (project) => project.id === 'foundation-package-tests'
  );
  expect(foundationTestsProject).toBeDefined();

  const config = createProjectConfig(foundationTestsProject!);
  expect(config.compilerOptions.types).toContain('node');
});

it('includes owner-local editor harness files in the editor test project', () => {
  const editorTestsProject = OWNER_TEST_TYPECHECK_PROJECTS.find(
    (project) => project.id === 'editor-tests'
  );
  expect(editorTestsProject).toBeDefined();

  const config = createProjectConfig(editorTestsProject!);
  expect(config.include).toContain(repoPath('tooling/test/harness/editor/ownership/**/*'));
});

it('keeps content tests out of Web Snapshot Viewer test roots', () => {
  const viewerTestsProject = OWNER_TEST_TYPECHECK_PROJECTS.find(
    (project) => project.id === 'web-snapshot-viewer-tests'
  );
  expect(viewerTestsProject).toBeDefined();

  const config = createProjectConfig(viewerTestsProject!);
  expect(config.include).not.toContain(
    repoPath('apps/extension/src/content/public/preparation-surface/**/*')
  );
  expect(config.include).not.toContain(repoPath('apps/extension/src/content/**/*'));
  expect(collectRootFiles(viewerTestsProject!)).not.toContain(
    'apps/extension/src/content/public/preparation-surface/index.test.tsx'
  );
});

it('keeps only production preparation-surface roots in the viewer project', () => {
  const viewerProject = PRODUCTION_TYPECHECK_PROJECTS.find(
    (project) => project.id === 'web-snapshot-viewer'
  );
  expect(viewerProject).toBeDefined();

  const rootFiles = collectRootFiles(viewerProject!);
  expect(rootFiles).toContain('apps/extension/src/content/public/preparation-surface/index.tsx');
  expect(rootFiles).not.toContain(
    'apps/extension/src/content/public/preparation-surface/index.test.tsx'
  );
  expect(rootFiles).not.toContain(
    'apps/extension/src/content/public/preparation-surface/mode-state.test-support.ts'
  );
});

it('includes nested editor ownership harness files in the test harness project', () => {
  const config = createProjectConfig(TEST_HARNESS_TYPECHECK_PROJECT);
  expect(config.include).toContain(repoPath('tooling/test/harness/**/*'));
});
