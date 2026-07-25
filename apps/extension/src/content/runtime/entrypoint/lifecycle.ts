import { createLogger } from '@sniptale/platform/observability/logger';
import type { ContentRuntimeCleanup } from '../bootstrap';
import { CONTENT_RUNTIME_CLEANUP_KEY } from './markers';

// policyStateIds: [] - body readiness is disposable DOM lifecycle coordination, not authority.
const logger = createLogger({ namespace: 'ContentEntrypointBootstrap' });
let pendingBodyReadyInitialization = false;

type ContentRuntimeGlobal = typeof globalThis & {
  [CONTENT_RUNTIME_CLEANUP_KEY]?: ContentRuntimeCleanup;
};

function getContentRuntimeGlobal(): ContentRuntimeGlobal {
  return globalThis as ContentRuntimeGlobal;
}

export function registerContentRuntimeCleanup(cleanup: ContentRuntimeCleanup): void {
  const runtimeGlobal = getContentRuntimeGlobal();
  runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY] = () => {
    try {
      cleanup();
    } finally {
      delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
    }
  };
}

export function disposeExistingContentRuntime(): void {
  const runtimeGlobal = getContentRuntimeGlobal();
  const cleanup = runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
  delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];

  try {
    cleanup?.();
  } catch (error) {
    logger.warn('Failed to dispose previous content runtime before reinjection', error);
  }
}

export function runWhenContentBodyReady(initialize: () => void): void {
  if (pendingBodyReadyInitialization) {
    return;
  }

  pendingBodyReadyInitialization = true;
  let observer: MutationObserver | null = null;
  let domContentLoadedInstalled = false;
  let cleanup = () => undefined;
  const initializeWhenReady = () => {
    if (!document.body) {
      return;
    }

    cleanup();
    pendingBodyReadyInitialization = false;
    initialize();
  };
  cleanup = () => {
    observer?.disconnect();
    if (domContentLoadedInstalled) {
      document.removeEventListener('DOMContentLoaded', initializeWhenReady);
    }
  };

  if (document.readyState === 'loading') {
    domContentLoadedInstalled = true;
    document.addEventListener('DOMContentLoaded', initializeWhenReady, { once: true });
  }

  if (typeof MutationObserver === 'function' && document.documentElement) {
    observer = new MutationObserver(initializeWhenReady);
    observer.observe(document.documentElement, { childList: true });
  }

  window.setTimeout(initializeWhenReady, 0);
}
