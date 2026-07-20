import { expect, it } from 'vitest';

import { resolveAffectedTypecheckProjects } from './typecheck-project-map.mjs';

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
  ).toMatchObject({
    mode: 'full',
    reason: 'broad content owner changed',
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

it('falls back to full typecheck for broad shared and ambiguous harness changes', () => {
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
  expect(resolveAffectedTypecheckProjects(['tooling/test/harness/popup.tsx'])).toMatchObject({
    mode: 'full',
  });
});
