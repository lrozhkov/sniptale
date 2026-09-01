export const EDITOR_OWNER_MAPPINGS = [
  {
    owner: 'content-drawing-preferences',
    productionFile: 'apps/extension/src/content/drawing/preferences.ts',
    reason:
      'Drawing preference hydration and persistence are covered through the drawing controller suite.',
    testFiles: ['apps/extension/src/content/drawing/controller.test.ts'],
  },
  {
    owner: 'content-drawing-renderer',
    productionFile: 'apps/extension/src/content/drawing/render.ts',
    reason:
      'Drawing path rendering is covered by frame rendering and freehand geometry parity suites.',
    testFiles: [
      'apps/extension/src/content/drawing/frame.test.ts',
      'apps/extension/src/content/drawing/freehand-parity.test.ts',
    ],
  },
  {
    owner: 'video-annotation-builtins',
    productionPrefix: 'apps/extension/src/features/video/project/annotation-engine/builtins/',
    reason:
      'Built-in template factories, key mapping, and both shipped packs are covered by the focused built-in helper suite.',
    testFiles: [
      'apps/extension/src/features/video/project/annotation-engine/builtins/helpers.test.ts',
    ],
  },
  {
    owner: 'editor-shell-defaults',
    productionFile: 'apps/extension/src/editor/shell/page/defaults.ts',
    reason: 'Editor default hydration is covered by the page runtime suite.',
    testFiles: ['apps/extension/src/editor/shell/page/runtime.test.ts'],
  },
  {
    owner: 'editor-state-drawing-settings',
    productionFile: 'apps/extension/src/editor/state/factories.ts',
    reason: 'Editor drawing state defaults and mutations are covered by store action suites.',
    testFiles: ['apps/extension/src/editor/state/actions.test.ts'],
  },
  {
    owner: 'editor-state-drawing-settings',
    productionFile: 'apps/extension/src/editor/state/helpers.ts',
    reason: 'Editor drawing state helpers are covered by store action suites.',
    testFiles: ['apps/extension/src/editor/state/actions.test.ts'],
  },
  {
    owner: 'editor-state-drawing-settings',
    productionFile: 'apps/extension/src/editor/state/tool-settings.ts',
    reason: 'Editor drawing tool settings are covered by store action suites.',
    testFiles: ['apps/extension/src/editor/state/actions.test.ts'],
  },
  {
    owner: 'editor-state-drawing-settings',
    productionFile: 'apps/extension/src/editor/state/useEditorStore.ts',
    reason: 'Editor drawing store composition is covered by store action and viewport suites.',
    testFiles: [
      'apps/extension/src/editor/state/actions.test.ts',
      'apps/extension/src/editor/state/viewport-preview.test.ts',
    ],
  },
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
    owner: 'editor-step-drawing-pointer',
    productionFile: 'apps/extension/src/editor/controller/tools/step-drawing/pointer.ts',
    reason: 'Step insertion and value advancement are covered by the step tool-mode suite.',
    testFiles: [
      'apps/extension/src/editor/controller/tools/step-drawing/pointer.test.ts',
      'apps/extension/src/editor/controller/tools/tool-mode/step-value.test.ts',
    ],
  },
  {
    owner: 'editor-crop-workflow',
    productionPrefix: 'apps/extension/src/editor/controller/crop-workflow/',
    reason: 'Crop pointer and apply behavior are covered by the workflow integration suites.',
    testFiles: [
      'apps/extension/src/editor/controller/crop-workflow/index.test.ts',
      'apps/extension/src/editor/controller/crop-workflow/pointer.test.ts',
      'apps/extension/src/editor/controller/crop-workflow/apply.test.ts',
      'apps/extension/src/editor/controller/crop-workflow/apply/orchestrate.test.ts',
    ],
  },
  {
    owner: 'editor-prepared-object-lifecycle',
    productionPrefix: 'apps/extension/src/editor/controller/document/objects/',
    reason:
      'Prepared object geometry and interaction lifecycle are covered by focused object suites.',
    testFiles: [
      'apps/extension/src/editor/controller/document/objects/geometry-refresh.drawing.test.ts',
      'apps/extension/src/editor/controller/document/objects/interaction-patches.test.ts',
      'apps/extension/src/editor/controller/document/objects/prepare.drawing.test.ts',
      'apps/extension/src/editor/controller/document/objects/rich-shape-controls.test.ts',
      'apps/extension/src/editor/controller/document/objects/textbox-lifecycle.drawing.test.ts',
      'apps/extension/src/editor/controller/document/objects/textbox-lifecycle.test.ts',
    ],
  },
  {
    owner: 'editor-runtime-events',
    productionPrefix: 'apps/extension/src/editor/controller/events/',
    reason:
      'Runtime event routing is covered by focused canvas, movement, source, window, and drawing suites.',
    testFiles: [
      'apps/extension/src/editor/controller/events/draw-session-completion.test.ts',
      'apps/extension/src/editor/controller/events/drawing.test.ts',
      'apps/extension/src/editor/controller/events/index.owners.test.ts',
      'apps/extension/src/editor/controller/events/pan.test.ts',
      'apps/extension/src/editor/controller/events/runtime.canvas.test.ts',
      'apps/extension/src/editor/controller/events/runtime.crop-guide.test.ts',
      'apps/extension/src/editor/controller/events/runtime.object-moving.test.ts',
      'apps/extension/src/editor/controller/events/runtime.lifecycle.test.ts',
      'apps/extension/src/editor/controller/events/runtime.rich-shape.test.ts',
      'apps/extension/src/editor/controller/events/runtime.source-sync.test.ts',
      'apps/extension/src/editor/controller/events/runtime.window.test.ts',
      'apps/extension/src/editor/controller/events/text-target.test.ts',
    ],
  },
  {
    owner: 'editor-document-drawing-import-boundary',
    productionFile: 'apps/extension/src/editor/document/import-boundary.ts',
    reason:
      'Drawing metadata and recursive Fabric document import limits have focused parser proof.',
    testFiles: ['apps/extension/src/editor/document/import-boundary.test.ts'],
  },
  {
    owner: 'editor-drawing-preferences-runtime',
    productionFile: 'apps/extension/src/editor/drawing/preferences.ts',
    reason:
      'Editor drawing preference reconciliation and failure paths have focused adapter proof.',
    testFiles: ['apps/extension/src/editor/drawing/preferences.test.ts'],
  },
  {
    owner: 'editor-controller-binding-fixtures',
    productionPrefix: 'apps/extension/src/editor/controller/instance/bindings/test-fixtures',
    reason:
      'Controller binding fixtures are exercised by the instance and event binding owner suites.',
    testFiles: [
      'apps/extension/src/editor/controller/core/base.instance-ownership.test.ts',
      'apps/extension/src/editor/controller/instance/bindings/event/owners.test.ts',
    ],
  },
  {
    owner: 'editor-rich-shape-formatting',
    productionFile: 'apps/extension/src/editor/controller/rich-shape-formatting/patch.ts',
    reason: 'Rich-shape patch formatting is covered through the public selection action suite.',
    testFiles: ['apps/extension/src/editor/controller/public-actions/selection/rich-shape.test.ts'],
  },
  {
    owner: 'editor-selection-sync-dispatch',
    productionFile: 'apps/extension/src/editor/controller/selection/sync/dispatch.ts',
    reason: 'Selection synchronization dispatch is covered by image, step, and branch suites.',
    testFiles: [
      'apps/extension/src/editor/controller/selection/sync.image.test.ts',
      'apps/extension/src/editor/controller/selection/sync-step-style.test.ts',
      'apps/extension/src/editor/controller/selection/sync.coverage-branches.test.ts',
    ],
  },
  {
    owner: 'editor-rich-shape-drawing-transform',
    productionPrefix: 'apps/extension/src/editor/controller/tools/rich-shape-drawing/',
    reason:
      'Rich-shape selection and resize behavior are covered by runtime and object-control suites.',
    testFiles: [
      'apps/extension/src/editor/controller/events/runtime.rich-shape.test.ts',
      'apps/extension/src/editor/controller/document/objects/rich-shape-controls.test.ts',
      'apps/extension/src/editor/controller/tools/rich-shape-drawing/owners.test.ts',
    ],
  },
  {
    owner: 'editor-draw-session-transient-state',
    productionFile: 'apps/extension/src/editor/controller/transient/index.ts',
    reason: 'Draw-session completion state is covered by the shared drawing completion suite.',
    testFiles: [
      'apps/extension/src/editor/controller/draw-workflow/completion.drawing.test.ts',
      'apps/extension/src/editor/controller/transient/index.test.ts',
    ],
  },
  {
    owner: 'editor-preset-header-shared',
    productionFile:
      'apps/extension/src/editor/inspector/sidebar-controller/preset-header/shared.ts',
    reason: 'Preset header state and save panels are covered by focused preset header suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/sidebar-controller/preset-header/shared.test.tsx',
      'apps/extension/src/editor/inspector/presets/header.test.tsx',
      'apps/extension/src/editor/inspector/presets/header.save-panel.test.tsx',
    ],
  },
  {
    owner: 'editor-tool-inspector-shape-routes',
    productionPrefix: 'apps/extension/src/editor/inspector/tools/tool-inspector/routes/',
    reason:
      'Tool inspector route selection and shape catalog rendering are covered by inspector and shape-browser suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/tools/tool-inspector/index.test.tsx',
      'apps/extension/src/editor/inspector/tools/tool-inspector/routes/shape-branches.test.tsx',
      'apps/extension/src/editor/inspector/tools/shape-browser/index.test.tsx',
    ],
  },
  {
    owner: 'editor-input-window-events',
    productionFile: 'apps/extension/src/editor/controller/input/window-events.ts',
    reason: 'Window input adaptation is covered by focused, public facade, and integration suites.',
    testFiles: ['apps/extension/src/editor/controller/input/window-events.test.ts'],
  },
  {
    owner: 'editor-input-double-click',
    productionFile: 'apps/extension/src/editor/controller/input/double-click.ts',
    reason: 'Text editing entry is covered by the focused double-click suite.',
    testFiles: ['apps/extension/src/editor/controller/input/double-click.test.ts'],
  },
  {
    owner: 'editor-input-keyboard-editing',
    productionFile: 'apps/extension/src/editor/controller/input/keyboard-editing.ts',
    reason: 'Editing-key precedence is covered by focused resolver and composed keyboard suites.',
    testFiles: [
      'apps/extension/src/editor/controller/input/keyboard-editing.test.ts',
      'apps/extension/src/editor/controller/input/keyboard.test.ts',
    ],
  },
  {
    owner: 'editor-input-keyboard-shortcuts',
    productionFile: 'apps/extension/src/editor/controller/input/keyboard-shortcuts.ts',
    reason: 'Modifier shortcut precedence is covered by focused and composed keyboard suites.',
    testFiles: [
      'apps/extension/src/editor/controller/input/keyboard-shortcuts.test.ts',
      'apps/extension/src/editor/controller/input/keyboard.test.ts',
    ],
  },
  {
    owner: 'editor-input-keyboard-action-runner',
    productionPrefix: 'apps/extension/src/editor/controller/input/keyboard-action-runner/',
    reason:
      'Keyboard action dispatch and editing precedence are covered by the composed keyboard suite.',
    testFiles: ['apps/extension/src/editor/controller/input/keyboard.test.ts'],
  },
  {
    owner: 'editor-selection-root-contract',
    productionFile: 'apps/extension/src/editor/controller/selection/index.ts',
    reason: 'The selection root contract is covered by the combined apply and sync owner suite.',
    testFiles: ['apps/extension/src/editor/controller/selection/apply.image.test.ts'],
  },
  {
    owner: 'editor-layer-state-actions',
    productionPrefix: 'apps/extension/src/editor/controller/layer-actions/state/',
    reason: 'Layer state mutations are covered by lock, selection, and visibility action suites.',
    testFiles: [
      'apps/extension/src/editor/controller/layer-actions/state/lock.test.ts',
      'apps/extension/src/editor/controller/layer-actions/state/resize.test.ts',
      'apps/extension/src/editor/controller/layer-actions/state/selection.test.ts',
      'apps/extension/src/editor/controller/layer-actions/state/visibility.test.ts',
    ],
  },
  {
    owner: 'editor-selection-object-actions',
    productionPrefix: 'apps/extension/src/editor/controller/public-actions/selection/objects/',
    reason:
      'Selection mutations are covered by active-selection, delete, duplicate, and nudge suites.',
    testFiles: [
      'apps/extension/src/editor/controller/public-actions/selection/objects/active-selection.test.ts',
      'apps/extension/src/editor/controller/public-actions/selection/objects/delete.test.ts',
      'apps/extension/src/editor/controller/public-actions/selection/objects/duplicate.test.ts',
      'apps/extension/src/editor/controller/public-actions/selection/objects/nudge.test.ts',
      'apps/extension/src/editor/controller/public-actions/selection/objects/settings.test.ts',
    ],
  },
  {
    owner: 'editor-selection-settings-apply',
    productionPrefix: 'apps/extension/src/editor/controller/selection/apply/',
    reason:
      'Selection setting dispatch is covered by the current image and drawing selection suite.',
    testFiles: [
      'apps/extension/src/editor/controller/selection/apply.drawing.test.ts',
      'apps/extension/src/editor/controller/selection/apply.image.test.ts',
    ],
  },
  {
    owner: 'editor-selection-public-api',
    productionFile: 'apps/extension/src/editor/controller/public-api/document/selection.ts',
    reason:
      'Selection apply and preview callback adaptation is covered by the focused public API suite.',
    testFiles: ['apps/extension/src/editor/controller/public-api/document/selection.test.ts'],
  },
  {
    owner: 'editor-technical-data-insertion',
    productionPrefix: 'apps/extension/src/editor/controller/tools/technical-data-insertion/',
    reason:
      'Technical data content, sizing, and positioning are covered by focused insertion suites.',
    testFiles: [
      'apps/extension/src/editor/controller/tools/technical-data-insertion/content.test.ts',
      'apps/extension/src/editor/controller/tools/technical-data-insertion/positioning.test.ts',
      'apps/extension/src/editor/controller/tools/technical-data-insertion/sizing.test.ts',
      'apps/extension/src/editor/controller/tools/technical-data-positioning.test.ts',
    ],
  },
  {
    owner: 'editor-tool-mode-policy',
    productionPrefix: 'apps/extension/src/editor/controller/tools/tool-mode/',
    reason: 'Tool classification and interactivity are covered by crop and step mode suites.',
    testFiles: [
      'apps/extension/src/editor/controller/tools/tool-mode/classification.test.ts',
      'apps/extension/src/editor/controller/tools/tool-mode/crop-guide.test.ts',
      'apps/extension/src/editor/controller/tools/tool-mode/step-value.test.ts',
    ],
  },
  {
    owner: 'editor-tool-settings-preview',
    productionFile: 'apps/extension/src/editor/controller/tools/settings-preview.ts',
    reason: 'Shared drawing preview rendering is covered by the focused settings preview suite.',
    testFiles: ['apps/extension/src/editor/controller/tools/settings-preview.test.ts'],
  },
  {
    owner: 'editor-scene-resize-dimensions',
    productionFile:
      'apps/extension/src/editor/controller/public-actions/scene/resize/dimensions.ts',
    reason: 'Scene dimension mutations are covered by the resize and public action suites.',
    testFiles: [
      'apps/extension/src/editor/controller/public-actions/index.test.ts',
      'apps/extension/src/editor/controller/public-actions/scene/resize.coverage.test.ts',
    ],
  },
  {
    owner: 'editor-scene-resize-geometry',
    productionFile: 'apps/extension/src/editor/controller/public-actions/scene/resize/geometry.ts',
    reason: 'Scene geometry classification is covered directly and through resize actions.',
    testFiles: [
      'apps/extension/src/editor/controller/public-actions/scene/resize.coverage.test.ts',
      'apps/extension/src/editor/controller/public-actions/scene/resize/geometry.test.ts',
    ],
  },
  {
    owner: 'editor-scene-browser-frame-layout',
    productionFile:
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/layout.ts',
    reason: 'Browser-frame layout policy is covered by pure scene and composed mutation suites.',
    testFiles: [
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/mutation.test.ts',
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/scene.test.ts',
    ],
  },
  {
    owner: 'editor-scene-browser-frame-mutation',
    productionFile:
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/mutation.ts',
    reason: 'Browser-frame mutation ordering is covered directly and through scene actions.',
    testFiles: [
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/mutation.test.ts',
      'apps/extension/src/editor/controller/public-actions/scene/index.test.ts',
      'apps/extension/src/editor/controller/public-api/scene-actions/owners.test.ts',
    ],
  },
  {
    owner: 'editor-rich-shape-mutation-contract',
    productionPrefix: 'apps/extension/src/editor/objects/rich-shape/mutation/',
    reason: 'Rich-shape mutation behavior is covered by the root, mutation, and callout suites.',
    testFiles: [
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
      'apps/extension/src/editor/objects/rich-shape/text-frame/owners.test.ts',
    ],
  },
  {
    owner: 'editor-rectangle-shape-geometry',
    productionPrefix: 'apps/extension/src/editor/objects/shape-style-rectangle/',
    reason: 'Rectangle shape geometry is covered by owner, root contract, and scaling consumers.',
    testFiles: [
      'apps/extension/src/editor/objects/facade.contract.test.ts',
      'apps/extension/src/editor/objects/shape-style-apply.test.ts',
      'apps/extension/src/editor/objects/shape-style-rectangle.test.ts',
      'apps/extension/src/editor/objects/shape-style-rectangle/owners.test.ts',
      'apps/extension/src/editor/objects/shape-style.extra.test.ts',
      'apps/extension/src/editor/objects/shape-style.normalize.test.ts',
    ],
  },
  {
    owner: 'editor-blur-render-lifecycle',
    productionPrefix: 'apps/extension/src/editor/objects/annotation/blur/render/',
    reason: 'Blur rendering is covered by lifecycle, owner, and public rendering suites.',
    testFiles: [
      'apps/extension/src/editor/objects/annotation/blur-rendering.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/render.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/render/owners.test.ts',
    ],
  },
  {
    owner: 'editor-blur-backdrop-capture',
    productionPrefix: 'apps/extension/src/editor/objects/annotation/blur/backdrop/',
    reason: 'Blur backdrop capture is covered by bounds, canvas, capture, and render integration.',
    testFiles: [
      'apps/extension/src/editor/objects/annotation/blur/backdrop.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/backdrop/bounds.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/backdrop/canvas.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/backdrop/canvas/owners.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/backdrop/capture.test.ts',
      'apps/extension/src/editor/objects/annotation/blur/render.test.ts',
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
    owner: 'editor-floating-workspace-view-controls',
    productionFile: 'apps/extension/src/editor/workspace/floating/view-controls-popovers.tsx',
    reason: 'Floating view control popovers are covered through the view controls suite.',
    testFiles: ['apps/extension/src/editor/workspace/floating/view-controls.test.tsx'],
  },
  {
    owner: 'editor-compact-tool-command-routing',
    productionPrefix: 'apps/extension/src/editor/inspector/compact/tool-commands/',
    reason: 'Compact tool command routing is covered by image and template command suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/compact/tool-commands/image.test.tsx',
      'apps/extension/src/editor/inspector/compact/tool-commands/index.owners.test.tsx',
      'apps/extension/src/editor/inspector/compact/tool-commands/template.test.tsx',
    ],
  },
  {
    owner: 'editor-sidebar-controller',
    productionPrefix: 'apps/extension/src/editor/inspector/sidebar-controller/',
    reason:
      'Sidebar action and preset composition is covered by controller builder and state suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/sidebar-controller/action-rail.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/actions.coverage.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/actions.helpers.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/actions.state.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/border-preset.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/builders.action-props.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/builders.actions.coverage.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/builders.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/derived.locked.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/derived.source-image.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/drafts.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/index.image.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/preset-headers.test.ts',
      'apps/extension/src/editor/inspector/sidebar-controller/save-options.test.tsx',
      'apps/extension/src/editor/inspector/sidebar-controller/store.test.tsx',
    ],
  },
  {
    owner: 'shared-drawing-model',
    productionPrefix: 'apps/extension/src/features/drawing/',
    reason:
      'Shared drawing geometry, creation, updates, selection, and sessions are covered by focused model suites.',
    testFiles: [
      'apps/extension/src/features/drawing/arrow.test.ts',
      'apps/extension/src/features/drawing/create-update.test.ts',
      'apps/extension/src/features/drawing/geometry.test.ts',
      'apps/extension/src/features/drawing/model.test.ts',
      'apps/extension/src/features/drawing/preferences-sync.test.ts',
      'apps/extension/src/features/drawing/selection.test.ts',
      'apps/extension/src/features/drawing/session.test.ts',
      'apps/extension/src/features/drawing/text-layout.test.ts',
      'apps/extension/src/features/drawing/updates.test.ts',
    ],
  },
  {
    owner: 'editor-preset-display',
    productionPrefix: 'apps/extension/src/features/editor/presets/',
    reason: 'Preset preview and comparable settings behavior are covered by the display suite.',
    testFiles: ['apps/extension/src/features/editor/presets/display.test.ts'],
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
