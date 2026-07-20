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
