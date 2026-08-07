const DESIGN_SYSTEM_BUILDER_TEST =
  'apps/extension/src/design-system/previews/support/builders.test.tsx';
const CONTENT_FRAME_ANNOTATION_ADAPTER_FILES = [
  'apps/extension/src/content/selection/callout/index.tsx',
  'apps/extension/src/content/selection/interactive-frame/frame/handle-layer.tsx',
  'apps/extension/src/content/selection/step-badge-popover/index.tsx',
];
const CONTENT_FRAME_ANNOTATION_ADAPTER_TESTS = [
  'apps/extension/src/content/selection/callout-settings-popover/index.test.tsx',
  'apps/extension/src/content/selection/callout-settings-popover/preset-controller.test.tsx',
  'apps/extension/src/content/selection/callout-settings-popover/state.test.tsx',
  'apps/extension/src/content/selection/callout-settings-popover/views.test.tsx',
  'apps/extension/src/content/selection/frame-settings-popover/index.test.tsx',
  'apps/extension/src/content/selection/frame-settings-popover/views.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/callout-settings-lifecycle.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/frame/handles.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/frame/shell.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/overlays/callout.test.tsx',
  'apps/extension/src/content/selection/popover-sync/hooks.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/adapter.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/manual.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/preset-controller.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/save-section.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/state.test.tsx',
  'apps/extension/src/content/selection/step-badge-popover/views.test.tsx',
];
const SHARED_FRAME_ANNOTATION_CALLOUT_CONSUMER_TESTS = [
  'apps/extension/src/content/selection/callout/editing.effects.test.tsx',
  'apps/extension/src/content/selection/callout/editing.test.tsx',
  'apps/extension/src/content/selection/callout/intrinsic-width.test.ts',
  'apps/extension/src/content/selection/interactive-frame/overlays/callout-color-bindings.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/overlays/callout.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/toolbar/actions.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/toolbar/portal.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/toolbar/sections.test.tsx',
  'apps/extension/src/content/selection/interactive-frame/toolbar/trigger.test.tsx',
  'apps/extension/src/editor/frame-annotation/callout-projection.test.tsx',
  'apps/extension/src/editor/frame-annotation/projection-toolbar.test.tsx',
];
const SHARED_FRAME_ANNOTATION_PROJECTION_FILES = [
  'apps/extension/src/features/highlighter/frame-annotation/coordinate-space.ts',
  'apps/extension/src/features/highlighter/frame-annotation/floating-toolbar.tsx',
];
const SHARED_VOICE_INPUT_FILES = [
  'apps/extension/src/composition/voice-input/button.tsx',
  'apps/extension/src/composition/voice-input/session.ts',
  'apps/extension/src/composition/voice-input/trusted-events.ts',
];
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
  ...SHARED_VOICE_INPUT_FILES.map((productionFile) => ({
    owner: 'shared-voice-input',
    productionFile,
    allowCrossOwner: true,
    reason:
      'The content-neutral voice control and session lifecycle are exercised through the ' +
      'legacy content adapter tests and the editor callout consumer.',
    testFiles: [
      'apps/extension/src/content/voice-input/button.test.tsx',
      'apps/extension/src/content/voice-input/session.test.tsx',
      'apps/extension/src/editor/frame-annotation/callout-projection.test.tsx',
    ],
  })),
  {
    owner: 'shared-frame-preset-session-visibility',
    productionFile: 'apps/extension/src/features/highlighter/presets/session-visible.ts',
    allowCrossOwner: true,
    reason:
      'The canonical enabled-on-open and retain-during-session preset projection is exercised ' +
      'owner-locally and through both content and editor frame popover lifecycle suites.',
    testFiles: [
      'apps/extension/src/features/highlighter/presets/session-visible.test.ts',
      'apps/extension/src/composition/frame-annotation-controls/frame/popover-state.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/state/lifecycle.test.tsx',
    ],
  },
  ...CONTENT_FRAME_ANNOTATION_ADAPTER_FILES.map((productionFile) => ({
    owner: 'content-frame-annotation-adapter',
    productionFile,
    allowCrossOwner: true,
    reason:
      'Content-owned frame, callout, and step settings adapters are exercised through the ' +
      'canonical content interaction and popover suites after the shared-owner migration.',
    testFiles: CONTENT_FRAME_ANNOTATION_ADAPTER_TESTS,
  })),
  {
    owner: 'shared-frame-annotation-callout',
    productionPrefix: 'apps/extension/src/features/highlighter/frame-annotation/callout/',
    allowCrossOwner: true,
    reason:
      'The shared callout surface and interactions are exercised through both canonical content ' +
      'and editor projections in addition to their owner-local geometry and rendering suites.',
    testFiles: SHARED_FRAME_ANNOTATION_CALLOUT_CONSUMER_TESTS,
  },
  ...SHARED_FRAME_ANNOTATION_PROJECTION_FILES.map((productionFile) => ({
    owner: 'shared-frame-annotation-projection',
    productionFile,
    allowCrossOwner: true,
    reason:
      'Shared coordinate projection and toolbar commands are exercised in both content and editor ' +
      'hosts so viewport and command behavior cannot drift between runtimes.',
    testFiles: [
      'apps/extension/src/content/selection/interactive-frame/toolbar/actions.test.tsx',
      'apps/extension/src/content/selection/interactive-frame/toolbar/portal.test.tsx',
      'apps/extension/src/content/selection/interactive-frame/toolbar/sections.test.tsx',
      'apps/extension/src/content/selection/interactive-frame/toolbar/trigger.test.tsx',
      'apps/extension/src/editor/frame-annotation/interaction-controller.test.tsx',
      'apps/extension/src/editor/frame-annotation/projection-toolbar.test.tsx',
      'apps/extension/src/editor/frame-annotation/projection.test.tsx',
    ],
  })),
  {
    owner: 'shared-frame-annotation-step-badge',
    productionPrefix: 'apps/extension/src/features/highlighter/frame-annotation/step-badge/',
    allowCrossOwner: true,
    reason:
      'The shared badge ordering, boundary interaction, controls, and portal surface are ' +
      'exercised through their canonical content adapter suites and the shared manager contract.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/manager/step-badge/auto-values.test.ts',
      'apps/extension/src/content/selection/step-badge/drag.test.tsx',
      'apps/extension/src/content/selection/step-badge/index.test.tsx',
      'apps/extension/src/content/selection/step-badge/interaction.test.tsx',
      'apps/extension/src/content/selection/step-badge/placement.test.ts',
    ],
  },
  {
    owner: 'frame-annotation-controls',
    productionPrefix: 'apps/extension/src/composition/frame-annotation-controls/',
    allowCrossOwner: true,
    reason:
      'The shared creation and settings composition is exercised by its adjacent style contract ' +
      'and both content and editor consumers.',
    testFiles: [
      'apps/extension/src/composition/frame-annotation-controls/callout/preset-mutations.test.tsx',
      'apps/extension/src/composition/frame-annotation-controls/frame/styles.test.ts',
      'apps/extension/src/composition/frame-annotation-controls/frame/popover-state.test.tsx',
      'apps/extension/src/composition/frame-annotation-controls/shared-popovers.test.tsx',
      'apps/extension/src/content/overlay/toolbar/controls/frame-style.test.tsx',
      'apps/extension/src/content/overlay/toolbar/controls/future-callout.test.tsx',
      'apps/extension/src/content/selection/callout-settings-popover/index.test.tsx',
      'apps/extension/src/content/selection/callout-settings-popover/preset-controller.test.tsx',
      'apps/extension/src/content/selection/callout-settings-popover/state.test.tsx',
      'apps/extension/src/content/selection/callout-settings-popover/views.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/helpers.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/index.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/state/catalog.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/state/helpers.test.ts',
      'apps/extension/src/content/selection/frame-settings-popover/state/lifecycle.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/sync.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/views.test.tsx',
      'apps/extension/src/content/selection/popover-sync/anchor-grid.test.ts',
      'apps/extension/src/content/selection/popover-sync/hooks.test.tsx',
      'apps/extension/src/content/selection/popover-sync/preset-order.test.ts',
      'apps/extension/src/content/selection/popover-sync/preset-selection.test.ts',
      'apps/extension/src/content/selection/popover-sync/settings-header.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/adapter.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/manual.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/preset-controller.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/save-section.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/state.test.tsx',
      'apps/extension/src/content/selection/step-badge-popover/views.test.tsx',
      'apps/extension/src/editor/workspace/floating/tool-properties-rail.test.tsx',
    ],
  },
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
