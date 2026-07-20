const DESIGN_SYSTEM_BUILDER_TEST =
  'apps/extension/src/design-system/previews/support/builders.test.tsx';
const DESIGN_SYSTEM_PREVIEW_FILES = [
  'apps/extension/src/design-system/previews/compact-inspector-controls/design-system-examples.tsx',
  'apps/extension/src/design-system/previews/compact-inspector-controls/design-system.tsx',
  'apps/extension/src/design-system/previews/compact-inspector-controls/toggle-grid.preview.tsx',
  'apps/extension/src/design-system/previews/glass-select/design-system.tsx',
  'apps/extension/src/design-system/previews/inspector-shell/design-system.tsx',
  'apps/extension/src/design-system/previews/popup-shell/action-button/design-system.tsx',
  'apps/extension/src/design-system/previews/popup-shell/footer/preview.tsx',
  'apps/extension/src/design-system/previews/popup-shell/select/design-system.tsx',
];
const RICH_SHAPE_GEOMETRY_FILES = [
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/arrows.ts',
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/basic.ts',
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/decorative.ts',
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/flow-callout.ts',
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/index.ts',
  'apps/extension/src/features/editor/document/rich-shape/catalog/geometry/primitives.ts',
];
const EDITOR_DOCUMENT_LOAD_FILES = [
  'apps/extension/src/editor/controller/document/lifecycle/open/load/apply.ts',
  'apps/extension/src/editor/controller/document/lifecycle/open/load/options.ts',
  'apps/extension/src/editor/controller/document/lifecycle/open/load/run.ts',
  'apps/extension/src/editor/controller/document/lifecycle/open/load/trace.ts',
  'apps/extension/src/editor/controller/document/lifecycle/open/store.ts',
];
const EDITOR_LINE_SECTION_FILES = [
  'apps/extension/src/editor/inspector/tools/line-sections/fill.tsx',
  'apps/extension/src/editor/inspector/tools/line-sections/index.tsx',
  'apps/extension/src/editor/inspector/tools/line-sections/rough-fill.tsx',
  'apps/extension/src/editor/inspector/tools/line-sections/types.ts',
];
const EDITOR_WORKSPACE_COLOR_FILES = [
  'apps/extension/src/editor/inspector/workspace-color/compact-workspace-content.tsx',
  'apps/extension/src/editor/inspector/workspace-color/default-action.tsx',
];
const SCENARIO_STEP_FACTORY_FILES = [
  'apps/extension/src/features/scenario/project/factories/steps/capture.ts',
  'apps/extension/src/features/scenario/project/factories/steps/divider.ts',
  'apps/extension/src/features/scenario/project/factories/steps/index.ts',
  'apps/extension/src/features/scenario/project/factories/steps/note.ts',
  'apps/extension/src/features/scenario/project/factories/steps/section.ts',
];
const SCENARIO_V3_ELEMENT_FACTORY_FILES = [
  'apps/extension/src/features/scenario/project/v3/factories/elements/base.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/callout.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/code.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/image.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/index.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/line.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/shape.ts',
  'apps/extension/src/features/scenario/project/v3/factories/elements/text.ts',
];

export const COVERAGE_ROLLOUT_OWNER_MAPPINGS = [
  ...DESIGN_SYSTEM_PREVIEW_FILES.map((productionFile) => ({
    owner: 'design-system-shared-preview-builders',
    productionFile,
    reason: 'Shared preview composition is exercised by the consolidated builder behavior suite.',
    testFiles: [DESIGN_SYSTEM_BUILDER_TEST],
  })),
  {
    owner: 'design-system-theme-surface',
    productionFile: 'apps/extension/src/design-system/theme/index.tsx',
    reason: 'Preview theme ownership and missing-provider behavior are exercised by parity suites.',
    testFiles: ['apps/extension/src/design-system/parity/index.test.tsx'],
  },
  ...RICH_SHAPE_GEOMETRY_FILES.map((productionFile) => ({
    owner: 'editor-rich-shape-catalog-geometry',
    productionFile,
    reason:
      'Built-in geometry families and primitive output are exercised through catalog geometry.',
    testFiles: ['apps/extension/src/features/editor/document/rich-shape/catalog/geometry.test.ts'],
  })),
  ...EDITOR_DOCUMENT_LOAD_FILES.map((productionFile) => ({
    owner: 'editor-document-load-lifecycle',
    productionFile,
    reason: 'Document load apply, trace, and store effects are exercised by lifecycle coverage.',
    testFiles: [
      'apps/extension/src/editor/controller/document/coverage.test.ts',
      'apps/extension/src/editor/controller/document/lifecycle/split.test.ts',
    ],
  })),
  ...EDITOR_LINE_SECTION_FILES.map((productionFile) => ({
    owner: 'editor-inspector-line-sections',
    productionFile,
    reason: 'Line, fill, rough-fill, and patch contracts are exercised by inspector suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/tools/line.test.tsx',
      'apps/extension/src/editor/inspector/tools/line-rough-fill.test.tsx',
    ],
  })),
  ...EDITOR_WORKSPACE_COLOR_FILES.map((productionFile) => ({
    owner: 'editor-inspector-workspace-color',
    productionFile,
    reason: 'Workspace color rendering and commands are exercised by compact and floating suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/compact/inspector/details.test.tsx',
      'apps/extension/src/editor/workspace/floating/ui-migration-coverage.surfaces.test.tsx',
    ],
  })),
  ...SCENARIO_STEP_FACTORY_FILES.map((productionFile) => ({
    owner: 'scenario-step-factories',
    productionFile,
    reason: 'Every v2 step factory and default branch is exercised by the focused step suite.',
    testFiles: ['apps/extension/src/features/scenario/project/factories/steps.test.ts'],
  })),
  ...SCENARIO_V3_ELEMENT_FACTORY_FILES.map((productionFile) => ({
    owner: 'scenario-v3-element-factories',
    productionFile,
    reason: 'Every v3 element factory is exercised through the focused factory contract suite.',
    testFiles: ['apps/extension/src/features/scenario/project/v3/factories/index.test.ts'],
  })),
];
