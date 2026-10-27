import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from '../../test-support/test-helpers';

async function importOwnerMap() {
  return importFresh<typeof import('./focused-coverage-owner-map.mjs')>(
    './focused-coverage-owner-map.mjs',
    import.meta.url
  );
}

it('keeps committed focused coverage owner maps valid', async () => {
  const module = await importOwnerMap();

  expect(module.collectFocusedCoverageOwnerMappingViolations()).toEqual([]);
});

it.each(['core.ts', 'settings.ts', 'graph-mutations.ts'])(
  'retains AI settings aggregation and queued command proof for %s',
  async (owner) => {
    const module = await importOwnerMap();
    const root = 'apps/extension/src/composition/persistence/ai-settings';
    expect(module.resolveMappedCoverageOwnerTests(`${root}/${owner}`)).toEqual(
      expect.arrayContaining([
        `${root}/index.test.ts`,
        `${root}/graph-mutations.test.ts`,
        `${root}/graph-mutations.settings.test.ts`,
      ])
    );
  }
);

it.each(['parser', 'store'])(
  'selects unlock persistence and protected-provider route proof for the %s owner',
  async (owner) => {
    const module = await importOwnerMap();
    expect(
      module.resolveMappedCoverageOwnerTests(
        `apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.${owner}.ts`
      )
    ).toEqual([
      'apps/extension/src/background/ai/settings/secret-unlock-route.review-text.test.ts',
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.test.ts',
    ]);
  }
);

it('includes conditional locale initialization without dropping preference IO owner proof', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/composition/persistence/infrastructure/preference-service';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/browser-io.ts`)).toEqual([
    `${root}/accessors.test.ts`,
    `${root}/helpers.test.ts`,
    `${root}/index.test.ts`,
    'apps/extension/src/platform/i18n/locale/initialization.test.ts',
  ]);
});

it('includes retained Scenario consumers in canonical media deletion proof', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/composition/persistence/media-library';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/delete-cascade.ts`)).toEqual([
    `${root}/delete-cascade.scenario.test.ts`,
    `${root}/delete-cascade.sources.test.ts`,
    `${root}/delete-cascade.test.ts`,
    `${root}/dependencies.test.ts`,
  ]);
});

it('keeps offscreen lifecycle recovery and saved-result proof despite the runtime export mapping', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/background/media/video/runtime/handlers/state';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/offscreen-lifecycle.ts`)).toEqual([
    `${root}/offscreen-lifecycle.project-export.test.ts`,
    `${root}/offscreen-lifecycle.ready.test.ts`,
    `${root}/offscreen-lifecycle.saved-replay.test.ts`,
    `${root}/offscreen-lifecycle.stop-error.test.ts`,
    `${root}/offscreen-lifecycle.test.ts`,
    `${root}/recording-state.terminal-recovery.test.ts`,
  ]);
});

it('keeps the sender policy on its dedicated focused owner suite', async () => {
  const module = await importOwnerMap();

  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/background/media/video/runtime/sender-policy.ts'
    )
  ).toEqual(['apps/extension/src/background/media/video/runtime/sender-policy.test.ts']);
});

it('keeps popup runtime owners on their adjacent proof instead of the broad popup fallback', async () => {
  const module = await importOwnerMap();
  const runtimeRoot = 'apps/extension/src/popup/shell/runtime';

  expect(module.resolveMappedCoverageOwnerTests(`${runtimeRoot}/start/run.ts`)).toEqual([
    `${runtimeRoot}/start/run.test.tsx`,
  ]);
  expect(module.resolveMappedCoverageOwnerTests(`${runtimeRoot}/actions.ts`)).toEqual([
    `${runtimeRoot}/actions.test.tsx`,
  ]);
});

it('keeps selection-mode event bridge changes on bounded owner proof', async () => {
  const module = await importOwnerMap();

  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/content/selection/selection-mode/events/bridge/index.ts'
    )
  ).toEqual([
    'apps/extension/src/content/selection/selection-mode/events/bridge/root.test.ts',
    'apps/extension/src/content/selection/selection-mode/runtime/composition.test.ts',
  ]);
});

it('keeps a migration prefix non-exclusive so exact owner proof remains authoritative', async () => {
  const module = await importOwnerMap();
  const file = 'apps/extension/src/composition/persistence/projects/index.ts';

  expect(
    module.resolveMappedCoverageOwnerTests(file, {
      mappings: [
        {
          owner: 'migration-prefix',
          productionPrefix: 'apps/extension/src/composition/persistence/projects/',
          reason: 'broad migration integration proof',
          testFiles: ['apps/extension/src/composition/persistence/projects/index.test.ts'],
        },
        {
          owner: 'canonical-delete-owner',
          productionFile: file,
          reason: 'exact persistence retention proof',
          testFiles: ['apps/extension/src/composition/persistence/projects/index.delete.test.ts'],
        },
      ],
    })
  ).toEqual(['apps/extension/src/composition/persistence/projects/index.delete.test.ts']);
});

it('maps each moved extension UI entrypoint to its app-root smoke proof', async () => {
  const module = await importOwnerMap();

  expect(
    module.resolveMappedCoverageOwnerTests('apps/extension/src/design-system/index.tsx')
  ).toEqual(['apps/extension/src/design-system/shell/entry/index.test.tsx']);
  expect(module.resolveMappedCoverageOwnerTests('apps/extension/src/gallery/index.tsx')).toEqual([
    'apps/extension/src/gallery/shell/app-shell/entrypoint.test.tsx',
  ]);

  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/design-system/previews/glass-select/design-system.tsx'
    )
  ).toEqual(['apps/extension/src/design-system/previews/support/builders.test.tsx']);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/arrows.ts'
    )
  ).toEqual(['apps/extension/src/features/editor/document/rich-shape/catalog/geometry.test.ts']);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/features/scenario/project/factories/index.ts'
    )
  ).toEqual(['apps/extension/src/features/scenario/project/factories.test.ts']);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/features/editor/document/rich-shape/catalog/unrelated.ts'
    )
  ).toEqual([]);
  expect(module.resolveMappedCoverageOwnerTests('apps/extension/src/settings/index.tsx')).toEqual([
    'apps/extension/src/settings/shell/page/entrypoint.test.tsx',
  ]);
  expect(
    module.resolveMappedCoverageOwnerTests('apps/extension/src/web-snapshot-viewer/index.tsx')
  ).toEqual(['apps/extension/src/web-snapshot-viewer/shell/app/index.test.tsx']);
});

it('limits NH5 contract adapter mappings to the changed contract files', async () => {
  const module = await importOwnerMap();

  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/video-editor/runtime/controller/contracts/header.ts'
    )
  ).not.toEqual([]);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/video-editor/runtime/controller/contracts/index.ts'
    )
  ).toEqual([]);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/video-editor/workspace/sidebar/contracts/props.ts'
    )
  ).not.toEqual([]);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/video-editor/workspace/sidebar/contracts/index.ts'
    )
  ).toEqual([]);
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/video-editor/workspace/sidebar/contracts/panel-content.ts'
    )
  ).toEqual([]);
});

it('flags mapped production files that no longer exist', async () => {
  const root = createTempRoot('focused-coverage-missing-production-');
  writeFile(root, 'src/shared/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          owner: 'example',
          productionFile: 'src/shared/example/owner.ts',
          reason: 'example owner proof',
          testFiles: ['src/shared/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toContainEqual(
    expect.objectContaining({
      file: 'src/shared/example/owner.ts',
      rule: 'focused-coverage-owner-mapping-missing-production-file',
    })
  );
});

it('flags mapped production files excluded by the coverage registry', async () => {
  const root = createTempRoot('focused-coverage-excluded-production-');
  writeFile(
    root,
    'packages/foundation/src/example/owner.test-support.ts',
    'export const value = 1;\n'
  );
  writeFile(root, 'packages/foundation/src/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          allowMissingProductionTarget: true,
          owner: 'example',
          productionFile: 'packages/foundation/src/example/owner.test-support.ts',
          reason: 'example owner proof',
          testFiles: ['packages/foundation/src/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toContainEqual(
    expect.objectContaining({
      file: 'packages/foundation/src/example/owner.test-support.ts',
      rule: 'focused-coverage-owner-mapping-excluded-production-file',
    })
  );
});

it('flags mapped production files outside the coverage target population', async () => {
  const root = createTempRoot('focused-coverage-non-target-production-');
  writeFile(root, 'packages/foundation/src/example/owner.mjs', 'export const value = 1;\n');
  writeFile(root, 'packages/foundation/src/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          owner: 'example',
          productionFile: 'packages/foundation/src/example/owner.mjs',
          reason: 'example owner proof',
          testFiles: ['packages/foundation/src/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toContainEqual(
    expect.objectContaining({
      file: 'packages/foundation/src/example/owner.mjs',
      rule: 'focused-coverage-owner-mapping-non-coverage-production-file',
    })
  );
});

it('flags mapped production prefixes that no longer match production files', async () => {
  const root = createTempRoot('focused-coverage-empty-prefix-');
  writeFile(root, 'src/shared/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          owner: 'example',
          productionPrefix: 'src/shared/example/moved/',
          reason: 'example owner proof',
          testFiles: ['src/shared/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toContainEqual(
    expect.objectContaining({
      file: 'src/shared/example/moved/',
      rule: 'focused-coverage-owner-mapping-empty-production-prefix',
    })
  );
});

it('flags mapped production prefixes with only excluded coverage targets', async () => {
  const root = createTempRoot('focused-coverage-excluded-prefix-');
  writeFile(
    root,
    'packages/foundation/src/example/owner.types.ts',
    'export type Value = string;\n'
  );
  writeFile(root, 'packages/foundation/src/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          allowMissingProductionTarget: true,
          owner: 'example',
          productionPrefix: 'packages/foundation/src/example/',
          reason: 'example owner proof',
          testFiles: ['packages/foundation/src/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toContainEqual(
    expect.objectContaining({
      file: 'packages/foundation/src/example/',
      rule: 'focused-coverage-owner-mapping-empty-production-prefix',
    })
  );
});

it('allows mapped production prefixes with at least one production file', async () => {
  const root = createTempRoot('focused-coverage-live-prefix-');
  writeFile(root, 'packages/foundation/src/example/owner.ts', 'export const value = 1;\n');
  writeFile(root, 'packages/foundation/src/example/owner.test.ts', 'export const test = 1;\n');

  const violations = await withCwd(root, async () => {
    const module = await importOwnerMap();
    return module.collectFocusedCoverageOwnerMappingViolations({
      mappings: [
        {
          owner: 'example',
          productionPrefix: 'packages/foundation/src/example/',
          reason: 'example owner proof',
          testFiles: ['packages/foundation/src/example/owner.test.ts'],
        },
      ],
    });
  });

  expect(violations).toEqual([]);
});

it('routes the guide page to semantic document and persistence interaction proof', async () => {
  const module = await importOwnerMap();
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/scenario-editor/page-shell/guide-document.tsx'
    )
  ).toEqual(['apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx']);
});

it.each([
  'apps/extension/src/composition/persistence/review-workspaces/project-commands.ts',
  'apps/extension/src/composition/persistence/review-workspaces/store.ts',
  'apps/extension/src/composition/persistence/assets/resource-sessions.ts',
  'apps/extension/src/workflows/video-review/session.ts',
  'apps/extension/src/workflows/video-review/session-durable-access.ts',
])('retains the actual delayed-writer regression for %s', async (file) => {
  const module = await importOwnerMap();
  expect(module.resolveMappedCoverageOwnerTests(file)).toContain(
    'apps/extension/src/workflows/video-review/session.project-purge.test.ts'
  );
});

it('retains pending-opening, cancellation and disposal proof for the Gallery reader owner', async () => {
  const module = await importOwnerMap();
  expect(
    module.resolveMappedCoverageOwnerTests('apps/extension/src/gallery/video-review/use-session.ts')
  ).toEqual(
    expect.arrayContaining([
      'apps/extension/src/gallery/video-review/use-session.purge.test.tsx',
      'apps/extension/src/gallery/video-review/use-session.loaded.test.tsx',
      'apps/extension/src/gallery/video-review/use-session.resources.test.tsx',
    ])
  );
});

it('keeps actual Stop and startup concurrency proof on the completion owner', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/background/media/video';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/runtime/recording-completion.ts`)).toEqual(
    expect.arrayContaining([
      `${root}/runtime/handlers/state/recording-state.terminal-recovery.test.ts`,
      `${root}/runtime/recording-completion.stop.test.ts`,
      `${root}/manager/start-owner.test.ts`,
      `${root}/capture-surface.recovery.window-only.test.ts`,
    ])
  );
});

it('selects completion refresh, body states, and native clock response proof', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/popup/shell/runtime/handlers.ts`)).toEqual(
    [`${root}/popup/shell/runtime/handlers.test.tsx`]
  );
  expect(
    module.resolveMappedCoverageOwnerTests(`${root}/popup/recording/video/setup/body.tsx`)
  ).toContain(`${root}/popup/recording/video/setup/body.states.test.tsx`);
  expect(
    module.resolveMappedCoverageOwnerTests(
      `${root}/background/media/video/runtime/handlers/state/recording-state-response.ts`
    )
  ).toContain(
    `${root}/background/media/video/runtime/handlers/state/recording-state.clock.test.ts`
  );
});

it.each([
  'document-settings.tsx',
  'mask-settings.tsx',
  'transition-settings.tsx',
  'playback-settings.tsx',
  'camera-settings.tsx',
])('routes tour %s to stage appearance and inherited settings proof', async (file) => {
  const module = await importOwnerMap();
  expect(
    module.resolveMappedCoverageOwnerTests(
      `apps/extension/src/scenario-editor/page-shell/tour/${file}`
    )
  ).toEqual([
    'apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.test.tsx',
    'apps/extension/src/scenario-editor/page-shell/tour/inspector-styles.test.tsx',
  ]);
});

it('executes real tour library and workspace proof when the page test substitutes tour UI', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/scenario-editor/page-shell';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/tour/library.tsx`)).toEqual([
    `${root}/ScenarioEditorPage.test.tsx`,
    `${root}/tour/library.test.tsx`,
    `${root}/tour/workspace.test.tsx`,
  ]);
});

it('includes linked clip proof in the exclusive duration owner scope', async () => {
  const module = await importOwnerMap();
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/features/video/project/timeline/basics.ts'
    )
  ).toContain('apps/extension/src/features/video/project/timeline/basics.waveforms.test.ts');
});

it('keeps concurrent project publication proof in root contract validation selection', async () => {
  const module = await importOwnerMap();
  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/features/video/project/validation/root.ts'
    )
  ).toContain('apps/extension/src/composition/persistence/projects/index.stale-save.test.ts');
});

it('selects canonical scoped history and marker replay proof', async () => {
  const module = await importOwnerMap();
  const tests = module.resolveMappedCoverageOwnerTests(
    'apps/extension/src/content/parser/page-preparation/history/snapshot-delta.ts'
  );
  expect(tests).toEqual(
    expect.arrayContaining([
      'apps/extension/src/content/parser/page-preparation/history/scoped-reset.test.ts',
      'apps/extension/src/content/parser/page-preparation/history/domain-navigation.test.ts',
      'apps/extension/src/content/parser/page-preparation/annotations/history.integration.test.ts',
      'apps/extension/src/content/selection/quick-edit-runtime/annotation.history.integration.test.ts',
      'apps/extension/src/content/selection/quick-edit-runtime/text-marker.test.ts',
    ])
  );
});

it('retains serialized pin and toolbar visibility write proof for the content session owner', async () => {
  const module = await importOwnerMap();
  const root = 'apps/extension/src/content/overlay/app/content-mode/state';
  expect(module.resolveMappedCoverageOwnerTests(`${root}/pin-session.ts`)).toEqual(
    expect.arrayContaining([`${root}/pin-session.test.ts`, `${root}/pin-session-writes.test.ts`])
  );
});
