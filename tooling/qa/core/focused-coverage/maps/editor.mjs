export const EDITOR_OWNER_MAPPINGS = [
  {
    owner: 'editor-controller-core-instance',
    productionFile: 'apps/extension/src/editor/controller/core/controller.ts',
    reason: 'Controller instance ownership is covered by core instance and crop delegation tests.',
    testFiles: [
      'apps/extension/src/editor/controller/core/base.instance-ownership.test.ts',
      'apps/extension/src/editor/controller/core/controller-crop-actions.test.ts',
    ],
  },
  {
    owner: 'editor-controller-core-instance',
    productionFile: 'apps/extension/src/editor/controller/core/controller-crop-actions.ts',
    reason: 'Crop action delegation must stay bound to the controller instance seam.',
    testFiles: ['apps/extension/src/editor/controller/core/controller-crop-actions.test.ts'],
  },
  {
    owner: 'editor-controller-core-instance',
    productionFile: 'apps/extension/src/editor/controller/core/controller-state.ts',
    reason: 'Controller state ownership is covered by the core instance ownership suite.',
    testFiles: ['apps/extension/src/editor/controller/core/base.instance-ownership.test.ts'],
  },
  {
    owner: 'editor-freehand-dynamic-width-outline',
    productionFile:
      'apps/extension/src/editor/controller/freehand/dynamic-width/outline/points.ts',
    reason: 'Dynamic-width outline assembly is covered by the outline owner suite.',
    testFiles: [
      'apps/extension/src/editor/controller/freehand/dynamic-width/outline/owners.test.ts',
    ],
  },
  {
    owner: 'editor-freehand-point-cloud-modeling',
    productionFile: 'apps/extension/src/editor/controller/freehand/modeling.ts',
    reason: 'Freehand stroke modeling is covered by the focused modeling suite.',
    testFiles: ['apps/extension/src/editor/controller/freehand/modeling.test.ts'],
  },
  {
    owner: 'editor-freehand-recognition-corners',
    productionFile: 'apps/extension/src/editor/controller/freehand/recognition-corners.ts',
    reason: 'Corner-profile behavior is exercised through the focused recognition suite.',
    testFiles: ['apps/extension/src/editor/controller/freehand/recognition.test.ts'],
  },
  {
    owner: 'editor-selection-root-contract',
    productionFile: 'apps/extension/src/editor/controller/selection/index.ts',
    reason: 'The selection root contract is covered by the combined apply and sync owner suite.',
    testFiles: ['apps/extension/src/editor/controller/selection/coverage.test.ts'],
  },
  {
    owner: 'editor-rich-shape-callout-controls-contract',
    productionPrefix: 'apps/extension/src/editor/objects/rich-shape/callout-controls/',
    reason: 'Callout-control behavior is covered by the complete owner-local control suite.',
    testFiles: [
      'apps/extension/src/editor/objects/rich-shape/callout-controls.test.ts',
      'apps/extension/src/editor/objects/rich-shape/callout-controls/coordinates.test.ts',
      'apps/extension/src/editor/objects/rich-shape/callout-controls/factory.test.ts',
      'apps/extension/src/editor/objects/rich-shape/callout-controls/handlers.test.ts',
      'apps/extension/src/editor/objects/rich-shape/callout-controls/patch.test.ts',
    ],
  },
  {
    owner: 'editor-rich-shape-mutation-contract',
    productionPrefix: 'apps/extension/src/editor/objects/rich-shape/mutation/',
    reason: 'Rich-shape mutation behavior is covered by the root, mutation, and callout suites.',
    testFiles: [
      'apps/extension/src/editor/objects/rich-shape/callout-object-mutation.test.ts',
      'apps/extension/src/editor/objects/rich-shape/index.test.ts',
      'apps/extension/src/editor/objects/rich-shape/mutation.test.ts',
      'apps/extension/src/editor/objects/rich-shape/mutation/owners.test.ts',
    ],
  },
  {
    owner: 'editor-rich-shape-text-frame-contract',
    productionPrefix: 'apps/extension/src/editor/objects/rich-shape/text-frame/',
    reason: 'Text-frame behavior is covered at the object owner and controller projection seams.',
    testFiles: [
      'apps/extension/src/editor/controller/rich-shape-text-editor/geometry.test.ts',
      'apps/extension/src/editor/objects/rich-shape/text-frame.test.ts',
      'apps/extension/src/editor/objects/rich-shape/text-frame/owners.test.ts',
    ],
  },
  {
    owner: 'editor-line-controls-contract',
    productionPrefix: 'apps/extension/src/editor/objects/line/controls/',
    reason: 'Line control construction is covered by the aggregate and leaf control suites.',
    testFiles: [
      'apps/extension/src/editor/objects/line/controls.test.ts',
      'apps/extension/src/editor/objects/line/controls/factory.test.ts',
      'apps/extension/src/editor/objects/line/controls/midpoint.test.ts',
      'apps/extension/src/editor/objects/line/controls/point.test.ts',
    ],
  },
  {
    owner: 'editor-line-rough-fill-contract',
    productionPrefix: 'apps/extension/src/editor/objects/line/rough-fill/',
    reason: 'Line rough-fill rendering is covered by leaf, aggregate, and state integration suites.',
    testFiles: [
      'apps/extension/src/editor/objects/line/rough-fill.test.ts',
      'apps/extension/src/editor/objects/line/rough-fill/drawers.test.ts',
      'apps/extension/src/editor/objects/line/rough-fill/pattern.test.ts',
      'apps/extension/src/editor/objects/line/rough-fill/stroke.test.ts',
      'apps/extension/src/editor/objects/line/state/fill.test.ts',
    ],
  },
  {
    owner: 'editor-line-settings-contract',
    productionPrefix: 'apps/extension/src/editor/objects/line/settings/',
    reason: 'Line settings parsing is covered by leaf, root-state, and drawing-consumer suites.',
    testFiles: [
      'apps/extension/src/editor/controller/drawing/draft-update/owners.test.ts',
      'apps/extension/src/editor/controller/drawing/line-size.branches.test.ts',
      'apps/extension/src/editor/objects/line/gradient-stops.test.ts',
      'apps/extension/src/editor/objects/line/settings/fill.test.ts',
      'apps/extension/src/editor/objects/line/settings/number.test.ts',
      'apps/extension/src/editor/objects/line/settings/read.test.ts',
      'apps/extension/src/editor/objects/line/settings/rough-fill.test.ts',
      'apps/extension/src/editor/objects/line/settings/shadow.test.ts',
      'apps/extension/src/editor/objects/line/settings/stroke.test.ts',
      'apps/extension/src/editor/objects/line/state.test.ts',
    ],
  },
  {
    owner: 'editor-magnet-manager',
    productionFile: 'apps/extension/src/editor/controller/magnet/manager.ts',
    reason: 'Magnet manager behavior is covered by focused manager tests.',
    testFiles: [
      'apps/extension/src/editor/controller/magnet/manager.test.ts',
      'apps/extension/src/editor/controller/magnet/manager.active-tool.test.ts',
    ],
  },
  {
    owner: 'editor-floating-workspace-tool-properties',
    productionFile: 'apps/extension/src/editor/workspace/floating/tool-properties-rail.tsx',
    reason: 'Floating tool properties rail behavior is covered by its focused component suite.',
    testFiles: ['apps/extension/src/editor/workspace/floating/tool-properties-rail.test.tsx'],
  },
  {
    owner: 'editor-floating-workspace-selection-toolbar-geometry',
    productionFile: 'apps/extension/src/editor/workspace/floating/canvas-toolbar-geometry.ts',
    reason: 'Selection toolbar geometry is covered by the focused geometry suite.',
    testFiles: ['apps/extension/src/editor/workspace/floating/canvas-toolbar-geometry.test.ts'],
  },
  {
    owner: 'editor-floating-workspace-view-controls',
    productionFile: 'apps/extension/src/editor/workspace/floating/view-controls-popovers.tsx',
    reason: 'Floating view control popovers are covered through the view controls suite.',
    testFiles: ['apps/extension/src/editor/workspace/floating/view-controls.test.tsx'],
  },
  {
    owner: 'editor-custom-shape-import',
    productionPrefix: 'apps/extension/src/editor/objects/custom-shapes/',
    reason:
      'Custom shape import parsing, budget, and persistence are covered by focused import suites.',
    testFiles: [
      'apps/extension/src/editor/objects/custom-shapes/budget.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/importer.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/import-persistence.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/excalidraw/parser.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/excalidraw/geometry.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/path-data.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/svg-safety.test.ts',
    ],
  },
  {
    owner: 'editor-shape-browser-custom-import',
    productionPrefix: 'apps/extension/src/editor/inspector/tools/shape-browser/',
    reason:
      'Shape browser custom import state and diagnostics are covered by focused browser import suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/tools/shape-browser/custom-shapes.import.test.tsx',
      'apps/extension/src/editor/inspector/tools/shape-browser/custom-shapes.hook.test.tsx',
      'apps/extension/src/editor/inspector/tools/shape-browser/custom-shapes.stale.test.tsx',
      'apps/extension/src/editor/inspector/tools/shape-browser/custom-shapes.test.tsx',
    ],
  },
];
