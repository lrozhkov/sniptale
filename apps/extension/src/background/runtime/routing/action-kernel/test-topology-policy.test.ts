import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const actionKernelProofFiles = [
  'apps/extension/src/background/runtime/routing/action-kernel/handlers.project-export.test.ts',
  'apps/extension/src/background/runtime/routing/action-kernel/index.test.ts',
  'apps/extension/src/background/runtime/routing/action-kernel/registry.drift.test.ts',
] as const;

const directRouterAdapterTests = [
  'apps/extension/src/background/runtime/routing/tab-dispatch/adapter.test.ts',
  'apps/extension/src/background/media/video/runtime/router.export.test.ts',
  'apps/extension/src/background/media/video/runtime/router.extended.test.ts',
  'apps/extension/src/background/media/video/runtime/handlers/export/route.authorization.test.ts',
] as const;

function repoPath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(repoPath(relativePath), 'utf8');
}

it('keeps runtime route fixtures derived from the action-kernel registry', () => {
  const routeSupportSource = readRepoFile(
    'tooling/test/support/background-runtime-messaging-routes.test-support.ts'
  );

  expect(routeSupportSource).toContain('getActionRouteMessageTypesByKind');
  expect(routeSupportSource).not.toMatch(/\\[[^\\]]*VideoMessageType\\./s);
  expect(routeSupportSource).not.toMatch(/\\[[^\\]]*MessageType\\./s);
});

it('keeps direct router tests named as adapter or owner-local boundary proof', () => {
  for (const relativePath of directRouterAdapterTests) {
    expect(existsSync(repoPath(relativePath)), relativePath).toBe(true);
  }

  const boundaryTests = readdirSync(
    repoPath('apps/extension/src/background/runtime/routing/boundary')
  )
    .filter((fileName) => fileName.includes('tab-routing') && fileName.endsWith('.test.ts'))
    .sort();
  expect(boundaryTests).toEqual(['listener.tab-routing.test.ts']);

  const tabDispatchTests = readdirSync(
    repoPath('apps/extension/src/background/runtime/routing/tab-dispatch')
  )
    .filter((fileName) => fileName.endsWith('.test.ts'))
    .sort();
  expect(tabDispatchTests).toEqual([
    'adapter.test.ts',
    'authorization.test.ts',
    'capability.test.ts',
    'capture-page-access.test.ts',
    'page-access.test.ts',
    'sender-policy.test.ts',
    'video-control.test.ts',
    'web-snapshot.test.ts',
  ]);
});

it('keeps action-kernel tests as primary project-export authorization proof', () => {
  for (const relativePath of actionKernelProofFiles) {
    expect(existsSync(repoPath(relativePath)), relativePath).toBe(true);
  }

  const projectExportAdapterTest = readRepoFile(
    'apps/extension/src/background/media/video/runtime/handlers/export/route.authorization.test.ts'
  );
  expect(projectExportAdapterTest).toContain('without boundary preauthorization');
  expect(projectExportAdapterTest).not.toContain('issueProjectExportStartCapability');
  expect(projectExportAdapterTest).not.toContain('issueProjectExportCancelCapability');
});
