import { isFullContentRuntimeMounted } from '../entrypoint/markers';
import { createQuickActionHotkeyRuntime } from '../../platform/quick-action-hotkeys';
import { loadShimQuickActions, shimQuickActionStorage } from './quick-actions';
import { triggerQuickActionFromShim, wakeContentRuntimeFromShim } from './transport';

const CONTENT_RUNTIME_SHIM_CLEANUP_KEY = '__sniptaleContentRuntimeShimCleanup';

type ContentRuntimeShimGlobal = typeof globalThis & {
  [CONTENT_RUNTIME_SHIM_CLEANUP_KEY]?: () => void;
};

function getShimGlobal(): ContentRuntimeShimGlobal {
  return globalThis as ContentRuntimeShimGlobal;
}

function isTopLevelWindow(): boolean {
  return window.self === window.top;
}

function disposeExistingShim(): void {
  const shimGlobal = getShimGlobal();
  const cleanup = shimGlobal[CONTENT_RUNTIME_SHIM_CLEANUP_KEY];
  delete shimGlobal[CONTENT_RUNTIME_SHIM_CLEANUP_KEY];
  cleanup?.();
}

function observeFullRuntimeMounted(onMounted: () => void): () => void {
  if (isFullContentRuntimeMounted()) {
    onMounted();
    return () => undefined;
  }

  const observer = new MutationObserver(() => {
    if (isFullContentRuntimeMounted()) {
      onMounted();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}

function initializeContentRuntimeShim(): void {
  if (!isTopLevelWindow()) {
    return;
  }

  disposeExistingShim();
  if (isFullContentRuntimeMounted()) {
    return;
  }

  const hotkeys = createQuickActionHotkeyRuntime({
    getActions: loadShimQuickActions,
    storage: shimQuickActionStorage,
    triggerQuickAction: (action) => triggerQuickActionFromShim(action),
  });
  let cleanupObserver: () => void = () => undefined;
  const cleanup = () => {
    cleanupObserver();
    hotkeys.stop();
    delete getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY];
  };

  getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY] = cleanup;
  hotkeys.start();
  cleanupObserver = observeFullRuntimeMounted(cleanup);

  void wakeContentRuntimeFromShim().catch(() => undefined);
}

initializeContentRuntimeShim();
