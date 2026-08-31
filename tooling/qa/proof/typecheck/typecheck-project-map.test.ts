import { expect, it } from 'vitest';

import {
  requiresFullTypecheckControlProof,
  resolveAffectedTypecheckProjects,
} from './typecheck-project-map.mjs';

it('resolves owner source changes to the owner and owner-local test projects', () => {
  expect(resolveAffectedTypecheckProjects(['apps/extension/src/popup/index.tsx'])).toEqual({
    mode: 'affected',
    projectIds: ['popup', 'popup-tests'],
    reason: 'changed owner projects',
  });
});

it('keeps a moved app runtime inside its owner-local typecheck projects', () => {
  expect(
    resolveAffectedTypecheckProjects(['apps/extension/src/camera-recorder/index.tsx'])
  ).toEqual({
    mode: 'affected',
    projectIds: ['camera-recorder', 'camera-recorder-tests'],
    reason: 'changed owner projects',
  });
});

it('keeps sanctioned content dependents in the affected closure', () => {
  expect(
    resolveAffectedTypecheckProjects([
      'apps/extension/src/content/overlay/toolbar/shell/drag-position.ts',
    ])
  ).toEqual({
    mode: 'affected',
    projectIds: ['content', 'content-tests', 'web-snapshot-viewer', 'web-snapshot-viewer-tests'],
    reason: 'changed owner projects',
  });
});

it('keeps content test and test-helper changes inside the content test project', () => {
  expect(
    resolveAffectedTypecheckProjects([
      'apps/extension/src/content/selection/frame-settings-popover/state/lifecycle.test.tsx',
      'apps/extension/src/content/parser/export-manager/diagnostics/core.test.helpers.ts',
    ])
  ).toEqual({
    mode: 'affected',
    projectIds: ['content-tests'],
    reason: 'changed owner projects',
  });
});

it('keeps cross-owner test-helper consumers in the conservative closure', () => {
  const resolution = resolveAffectedTypecheckProjects([
    'apps/extension/src/features/video/project/timeline/project-meta.test.helpers.ts',
  ]);

  expect(resolution).toMatchObject({
    mode: 'affected',
    reason: 'changed owner projects',
  });
  expect(resolution.projectIds).toEqual(
    expect.arrayContaining(['app-core', 'app-core-tests', 'video-editor', 'video-editor-tests'])
  );
});

it('keeps a deleted owner-local source inside its mapped affected closure', () => {
  expect(
    resolveAffectedTypecheckProjects(
      ['apps/extension/src/settings/sections/example/deleted-actions.ts'],
      {
        fileExists: () => false,
        headSourceResolver: () => 'export const deleted = true;\n',
      }
    )
  ).toEqual({
    mode: 'affected',
    projectIds: ['settings', 'settings-tests'],
    reason: 'changed owner projects',
  });
});

it('keeps unproven missing, broad shared, and unmapped targets on the full fail-safe path', () => {
  expect(
    resolveAffectedTypecheckProjects(
      ['apps/extension/src/settings/sections/example/missing-actions.ts'],
      { fileExists: () => false, headSourceResolver: () => null }
    )
  ).toMatchObject({
    mode: 'full',
    reason: expect.stringContaining('without HEAD deletion'),
  });
  expect(
    resolveAffectedTypecheckProjects([
      'apps/extension/src/composition/persistence/deleted-session.ts',
    ])
  ).toMatchObject({
    mode: 'full',
    reason: 'broad shared contract owner changed',
  });
  expect(resolveAffectedTypecheckProjects(['unknown/deleted-owner.ts'])).toMatchObject({
    mode: 'full',
    reason: 'unmapped TypeScript target: unknown/deleted-owner.ts',
  });
  expect(
    resolveAffectedTypecheckProjects(['apps/extension/src/settings-old/deleted-owner.ts'], {
      fileExists: () => false,
      headSourceResolver: () => 'export {};\n',
    })
  ).toMatchObject({
    mode: 'full',
    reason: 'unmapped TypeScript target: apps/extension/src/settings-old/deleted-owner.ts',
  });
});

it('maps owner-local tests and test-support files to owner test projects', () => {
  expect(
    resolveAffectedTypecheckProjects([
      'apps/extension/src/editor/inspector/tools/panel.test.tsx',
      'apps/extension/src/editor/inspector/ui-migration-coverage.commands.test-support.tsx',
    ])
  ).toEqual({
    mode: 'affected',
    projectIds: ['editor-tests'],
    reason: 'changed owner projects',
  });
});

it('falls back to full typecheck for broad shared changes', () => {
  expect(
    resolveAffectedTypecheckProjects([
      'packages/runtime-contracts/src/messaging/message-types/index.ts',
    ])
  ).toMatchObject({
    mode: 'full',
    reason: 'broad shared contract owner changed',
  });
  expect(
    resolveAffectedTypecheckProjects([
      'packages/platform/src/observability/message-tracer/messaging.ts',
    ])
  ).toMatchObject({
    mode: 'full',
    reason: 'broad shared contract owner changed',
  });
});

it('routes test harness changes through the generated harness project', () => {
  expect(resolveAffectedTypecheckProjects(['tooling/test/harness/popup.tsx'])).toMatchObject({
    mode: 'affected',
    projectIds: expect.arrayContaining(['test-harness']),
    reason: 'changed owner projects',
  });
});

it('separates typecheck-control proof triggers from unrelated QA TypeScript tests', () => {
  expect(requiresFullTypecheckControlProof(['package.json'])).toBe(true);
  expect(
    requiresFullTypecheckControlProof([
      'tooling/qa/proof/typecheck/typecheck-project-definitions.mjs',
    ])
  ).toBe(true);
  expect(requiresFullTypecheckControlProof(['tooling/qa/wrappers/checkpoint.test.ts'])).toBe(false);
});
