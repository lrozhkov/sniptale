export const OWNERSHIP_WAVES = [
  {
    id: 'content-facade-owners',
    files: [
      'apps/extension/src/content/overlay/ai/pick/runtime/index.ts',
      'apps/extension/src/content/overlay/ai/pick/runtime/runtime.ts',
      'apps/extension/src/content/parser/export-manager/diagnostics/console/index.ts',
      'apps/extension/src/content/logic/diagnostic-logger.ts',
      'apps/extension/src/content/parser/export-manager-diagnostics.ts',
      'apps/extension/src/content/parser/export-manager-dom-driver.ts',
      'apps/extension/src/content/selection/highlighter-runtime/index.ts',
      'apps/extension/src/content/selection/highlighter/index.ts',
      'apps/extension/src/content/selection/locker.ts',
      'apps/extension/src/content/selection/quick-edit.ts',
      'apps/extension/src/content/selection/region-capture.ts',
      'apps/extension/src/content/selection/region-capture/index.ts',
      'apps/extension/src/content/selection/selection-mode.ts',
      'apps/extension/src/content/parser/dom-utils/dom-helpers-text.ts',
      'apps/extension/src/content/overlay/video-annotations/index.ts',
      'apps/extension/src/content/overlay/video-clicks/index.ts',
    ],
    rule: 'facade-default-owner',
  },
  {
    id: 'content-owned-runtime-seams',
    files: [
      'apps/extension/src/content/overlay/ai/pick/runtime/mode.controller.ts',
      'apps/extension/src/content/overlay/ai/pick/runtime/overlay.controller.ts',
      'apps/extension/src/content/selection/area-selector/controller.ts',
      'apps/extension/src/content/parser/export-manager/diagnostics/console/controller.ts',
      'apps/extension/src/content/logic/crop-tool.ts',
      'apps/extension/src/content/application/diagnostics/runtime/logger.ts',
      'apps/extension/src/content/parser/export-manager/files/download.ts',
      'apps/extension/src/content/parser/export-manager/files/index.ts',
      'apps/extension/src/content/parser/export-manager/files/utils.ts',
      'apps/extension/src/content/parser/export-manager/service/index.ts',
      'apps/extension/src/content/selection/highlighter-runtime/controller.ts',
      'apps/extension/src/content/selection/highlighter-runtime/mode.ts',
      'apps/extension/src/content/selection/highlighter-runtime/runtime.helpers.ts',
      'apps/extension/src/content/selection/highlighter-cursor-style.controller.ts',
      'apps/extension/src/content/parser/popup-export/controller.ts',
      'apps/extension/src/content/selection/quick-edit.controller.ts',
      'apps/extension/src/content/selection/region-capture/session.ts',
      'apps/extension/src/content/selection/region-selector/index.ts',
      'apps/extension/src/content/selection/selection-mode.controller.ts',
      'apps/extension/src/content/runtime/tab-capture-fallback/index.ts',
      'apps/extension/src/content/parser/dom-utils/dom-helpers-text-resolver.controller.ts',
      'apps/extension/src/content/parser/dom-utils/dom-helpers-text.ts',
      'apps/extension/src/content/overlay/video-annotations/index.ts',
      'apps/extension/src/content/overlay/video-clicks/index.ts',
    ],
    rule: 'no-top-level-mutable-runtime-state',
  },
  {
    id: 'editor-owned-runtime-seams',
    files: ['apps/extension/src/editor/document/session-autosave/index.ts'],
    rule: 'no-top-level-mutable-runtime-state',
  },
  {
    id: 'video-editor-runtime-facades',
    files: ['apps/extension/src/video-editor/library/panel/thumbnails/ensure.ts'],
    rule: 'facade-default-owner',
  },
  {
    id: 'shared-runtime-facades',
    files: [
      'apps/extension/src/ui/theme/index.ts',
      'apps/extension/src/ui/theme/runtime.ts',
      'apps/extension/src/platform/i18n/locale/state.ts',
      '@sniptale/ui/product-feedback/toast-service',
    ],
    rule: 'facade-default-owner',
  },
  {
    id: 'shared-runtime-state-owners',
    files: [
      'apps/extension/src/features/media-hub/events/index.ts',
      'apps/extension/src/workflows/media-hub/store.ts',
    ],
    rule: 'no-top-level-mutable-runtime-state',
  },
  {
    id: 'offscreen-runtime-facades',
    files: [
      'apps/extension/src/offscreen/recording/context/index.ts',
      'apps/extension/src/offscreen/recording/setup/desktop-media/index.ts',
      'apps/extension/src/offscreen/project-export/index.ts',
    ],
    rule: 'facade-default-owner',
  },
  {
    id: 'offscreen-owned-runtime-seams',
    files: [
      'apps/extension/src/offscreen/recording/setup/desktop-media/controller.ts',
      'apps/extension/src/offscreen/recording/start/helpers.ts',
      'apps/extension/src/offscreen/project-export/service/index.ts',
    ],
    rule: 'no-top-level-mutable-runtime-state',
  },
  {
    id: 'background-runtime-facades',
    files: [
      'apps/extension/src/background/media/video/capture-source/index.ts',
      'apps/extension/src/background/diagnostics/diagnostic-collector-state.ts',
      'apps/extension/src/background/diagnostics/state.ts',
      'apps/extension/src/background/capture/download/download-router/download.ts',
      'apps/extension/src/background/capture/download/download-router/index.ts',
      'apps/extension/src/background/offscreen-manager.ts',
      'apps/extension/src/background/media/video/manager/session.ts',
      'apps/extension/src/background/media/video/runtime/offscreen-manager.ts',
      'apps/extension/src/background/media/video/runtime/export-capabilities.ts',
      'apps/extension/src/background/media/video/runtime/session-state/index.ts',
      'apps/extension/src/background/media/video/runtime/session-state/service/index.ts',
      'apps/extension/src/background/media/video/runtime/session-state/service/runtime-state-service.ts',
      'apps/extension/src/background/runtime/page-access/service.ts',
      'apps/extension/src/background/media/video/session-state/index.ts',
    ],
    rule: 'facade-default-owner',
  },
  {
    id: 'background-owned-runtime-seams',
    files: [
      'apps/extension/src/background/debugger/session/state-core.ts',
      'apps/extension/src/background/debugger/session/store.ts',
    ],
    rule: 'no-top-level-mutable-runtime-state',
  },
  {
    id: 'scenario-editor-owner-seams',
    files: [
      'apps/extension/src/scenario-editor/useScenarioEditorController.ts',
      'apps/extension/src/scenario-editor/scenario-editor-controller.state.ts',
      'apps/extension/src/scenario-editor/scenario-editor-controller.ui-state.ts',
    ],
    rule: 'no-top-level-mutable-runtime-state',
  },
];

export const OWNERSHIP_FACADE_FILES = new Set(
  OWNERSHIP_WAVES.filter((wave) => wave.rule === 'facade-default-owner').flatMap(
    (wave) => wave.files
  )
);

export const OWNERSHIP_STATE_FILES = new Set(
  OWNERSHIP_WAVES.filter((wave) => wave.rule === 'no-top-level-mutable-runtime-state').flatMap(
    (wave) => wave.files
  )
);
