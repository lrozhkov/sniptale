export const AS_NEVER_REMOVAL_OWNER_MAPPINGS = [
  {
    owner: 'shared-string-literal-boundaries',
    productionFile: 'packages/runtime-contracts/src/validation/string-literals.ts',
    reason:
      'Shared literal narrowing is exercised through scenario, storage, runtime, and EffectV1 boundary suites.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/runtime-wiring/parsers.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.boundaries.test.ts',
      'apps/extension/src/composition/persistence/highlighter/guards.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/boundary.test.ts',
    ],
  },
  {
    owner: 'runtime-wiring-parser-boundaries',
    productionFile: 'apps/extension/src/background/runtime/routing/runtime-wiring/parsers.ts',
    reason: 'Runtime wiring parser narrowing is covered by the focused parser suite.',
    testFiles: ['apps/extension/src/background/runtime/routing/runtime-wiring/parsers.test.ts'],
  },
  {
    owner: 'video-offscreen-manager-boundary',
    productionFile: 'apps/extension/src/background/media/video/runtime/offscreen-manager.ts',
    reason:
      'Offscreen context lookup and document creation DTOs are covered by offscreen manager suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/offscreen-manager.creation.test.ts',
      'apps/extension/src/background/media/video/runtime/offscreen-manager.test.ts',
    ],
  },
  {
    owner: 'video-offscreen-manager-boundary',
    productionFile: 'apps/extension/src/background/media/video/runtime/offscreen-document-dto.ts',
    reason:
      'Offscreen Chrome enum-compatible DTO construction is covered by offscreen manager creation tests.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/offscreen-manager.creation.test.ts',
    ],
  },
  {
    owner: 'content-page-style-inspector-controls',
    productionFile:
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/helpers.tsx',
    reason: 'Page-style inspector control summaries are covered by focused inspector UI suites.',
    testFiles: [
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/view.test.tsx',
      'apps/extension/src/content/overlay/page-style-inspector/property-controls/sections/sections.test.tsx',
    ],
  },
  {
    owner: 'editor-raster-metadata',
    productionFile: 'apps/extension/src/editor/controller/raster/object/metadata.ts',
    reason: 'Raster replacement metadata copy behavior is covered by raster object owner tests.',
    testFiles: ['apps/extension/src/editor/controller/raster/object/owners.test.ts'],
  },
  {
    owner: 'project-export-renderer-clip-compatibility',
    productionFile: 'apps/extension/src/offscreen/project-export/renderer/clip.ts',
    reason: 'Project export clip compatibility layers are covered by renderer clip tests.',
    testFiles: ['apps/extension/src/offscreen/project-export/renderer/clip.test.ts'],
  },
  {
    owner: 'popup-capture-mode-selector',
    productionFile:
      'apps/extension/src/popup/recording/video/setup/options/capture-mode-selector.tsx',
    reason: 'Capture mode selector labels and disabled states are covered by its component suite.',
    testFiles: [
      'apps/extension/src/popup/recording/video/setup/options/capture-mode-selector.test.tsx',
    ],
  },
  {
    owner: 'scenario-quick-edit-overlay-layer',
    productionFile:
      'apps/extension/src/scenario-editor/workspace/quick-edit/ScenarioQuickEditOverlayLayer.tsx',
    reason: 'Quick-edit overlay branch rendering is covered by the overlay layer suite.',
    testFiles: [
      'apps/extension/src/scenario-editor/workspace/quick-edit/ScenarioQuickEditOverlayLayer.test.tsx',
    ],
  },
  {
    owner: 'scenario-project-v3-guards',
    productionFile: 'apps/extension/src/features/scenario/project/v3/element-guards.capture.ts',
    reason: 'Scenario v3 guard narrowing is covered by boundary and template validation suites.',
    testFiles: [
      'apps/extension/src/features/scenario/project/v3/element-guards.capture.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.boundaries.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.test.ts',
    ],
  },
  {
    owner: 'scenario-project-v3-guards',
    productionFile: 'apps/extension/src/features/scenario/project/v3/element-guards.ts',
    reason: 'Scenario v3 element guard narrowing is covered by boundary guard suites.',
    testFiles: [
      'apps/extension/src/features/scenario/project/v3/element-guards.capture.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.boundaries.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.test.ts',
    ],
  },
  {
    owner: 'scenario-project-v3-presentation-guards',
    productionFile: 'apps/extension/src/features/scenario/project/v3/guards.presentation.ts',
    reason: 'Scenario v3 presentation guard narrowing is covered by project guard suites.',
    testFiles: [
      'apps/extension/src/features/scenario/project/v3/guards.boundaries.test.ts',
      'apps/extension/src/features/scenario/project/v3/guards.test.ts',
    ],
  },
  {
    owner: 'scenario-project-v3-template-validation',
    productionFile: 'apps/extension/src/features/scenario/project/v3/templates/validation.ts',
    reason: 'Scenario template validation narrowing is covered by template import/registry suites.',
    testFiles: [
      'apps/extension/src/features/scenario/project/v3/templates/import-pack.test.ts',
      'apps/extension/src/features/scenario/project/v3/templates/registry.test.ts',
    ],
  },
  {
    owner: 'shared-highlighter-blur-guards',
    productionPrefix: 'apps/extension/src/composition/persistence/highlighter/blur-',
    reason: 'Highlighter blur settings and stroke-style parsing are covered by storage guards.',
    testFiles: ['apps/extension/src/composition/persistence/highlighter/guards.test.ts'],
  },
  {
    owner: 'video-annotation-style-floors',
    productionFile: 'apps/extension/src/features/video/project/annotation/style-presets.ts',
    reason: 'Annotation template style floor behavior is covered by focused style floor tests.',
    testFiles: ['apps/extension/src/features/video/project/annotation/style-floors.test.ts'],
  },
];
