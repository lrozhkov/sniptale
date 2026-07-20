const SEND_RUNTIME_MESSAGE_BASELINE_FILES = [
  'apps/extension/src/background/media/privacy-erasure/cleanup.ts',
  'apps/extension/src/background/media/video/navigation/refresh.ts',
  'apps/extension/src/background/media/video/navigation/viewport-draw-state.ts',
  'apps/extension/src/background/media/video/runtime/handlers/export/reconcile.ts',
  'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.ts',
  'apps/extension/src/background/media/video/runtime/session-state/service/runtime-state-service.ts',
  'apps/extension/src/editor/document/file-actions/gallery-update.ts',
  'apps/extension/src/editor/document/file-actions/save.ts',
  'apps/extension/src/offscreen/recording/finalizer.ts',
  'apps/extension/src/offscreen/recording/multi-source/duration.ts',
  'apps/extension/src/offscreen/recording/multi-source/messages.ts',
  'apps/extension/src/settings/sections/ai-providers/runtime/secret-protection-status.ts',
  'apps/extension/src/settings/sections/ai-providers/runtime/settings-mutations.ts',
  'apps/extension/src/workflows/ai-session/llm-session.ts',
  'apps/extension/src/workflows/ai-session/secret-unlock-session.ts',
  'apps/extension/src/workflows/ai-settings/query.ts',
];

const SEND_TAB_MESSAGE_BASELINE_FILES = [
  'apps/extension/src/background/debugger/session/targets.ts',
  'apps/extension/src/background/diagnostics/runtime.ts',
  'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.ts',
  'apps/extension/src/background/runtime/tab-mode-router-screenshot/viewport.ts',
];

function createImportKeys(files, importName) {
  return files.map((file) => `${file}#${importName}`);
}

export const DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE = new Set([
  ...createImportKeys(SEND_RUNTIME_MESSAGE_BASELINE_FILES, 'sendRuntimeMessage'),
  ...createImportKeys(SEND_TAB_MESSAGE_BASELINE_FILES, 'sendTabMessage'),
]);
