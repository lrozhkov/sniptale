import { expect, it } from 'vitest';

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

it('keeps test fixtures out of production typecheck projects', () => {
  const editorProject = PRODUCTION_TYPECHECK_PROJECTS.find((project) => project.id === 'editor');
  expect(editorProject).toBeDefined();

  const config = createProjectConfig(editorProject!);
  expect(config.exclude).toContain(repoPath('apps/extension/src/**/test-fixtures*'));
  expect(config.exclude).toContain(repoPath('packages/platform/src/**/test-fixtures*'));
  expect(config.compilerOptions).not.toHaveProperty('composite');
  expect(config.files).toContain(`${REPO_ROOT}/apps/extension/src/vite-env.d.ts`);
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

it('includes nested editor ownership harness files in the test harness project', () => {
  const config = createProjectConfig(TEST_HARNESS_TYPECHECK_PROJECT);
  expect(config.include).toContain(repoPath('tooling/test/harness/**/*'));
});
