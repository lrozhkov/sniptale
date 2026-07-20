import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

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

it('keeps the sender policy on its dedicated focused owner suite', async () => {
  const module = await importOwnerMap();

  expect(
    module.resolveMappedCoverageOwnerTests(
      'apps/extension/src/background/media/video/runtime/sender-policy.ts'
    )
  ).toEqual(['apps/extension/src/background/media/video/runtime/sender-policy.test.ts']);
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
      'apps/extension/src/features/scenario/project/factories/steps/capture.ts'
    )
  ).toEqual(['apps/extension/src/features/scenario/project/factories/steps.test.ts']);
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
