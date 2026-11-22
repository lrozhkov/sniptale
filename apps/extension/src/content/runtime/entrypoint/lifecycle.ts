import { createLogger } from '@sniptale/platform/observability/logger';
import type { ContentRuntimeCleanup } from '../bootstrap';
import { CONTENT_RUNTIME_CLEANUP_KEY } from './markers';

// policyStateIds: [] - body readiness is disposable DOM lifecycle coordination, not authority.
const logger = createLogger({ namespace: 'ContentEntrypointBootstrap' });
let pendingBodyReadyInitialization = false;
const CONTENT_RUNTIME_PREPARATION_KEY = '__sniptaleContentRuntimePreparation';

type ContentRuntimeGlobal = typeof globalThis & {
  [CONTENT_RUNTIME_CLEANUP_KEY]?: ContentRuntimeCleanup;
  [CONTENT_RUNTIME_PREPARATION_KEY]?: () => void;
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

export function hasRegisteredContentRuntimeCleanup(): boolean {
  return typeof getContentRuntimeGlobal()[CONTENT_RUNTIME_CLEANUP_KEY] === 'function';
}

/** Replace only pending preparation. Keep the last valid runtime until its replacement is ready. */
export function registerContentRuntimePreparation(cancel: () => void): () => boolean {
  const runtime = getContentRuntimeGlobal();
  runtime[CONTENT_RUNTIME_PREPARATION_KEY]?.();
  const token = () => {
    if (runtime[CONTENT_RUNTIME_PREPARATION_KEY] === token) {
      delete runtime[CONTENT_RUNTIME_PREPARATION_KEY];
    }
    cancel();
  };
  runtime[CONTENT_RUNTIME_PREPARATION_KEY] = token;
  return () => {
    if (runtime[CONTENT_RUNTIME_PREPARATION_KEY] !== token) return false;
    delete runtime[CONTENT_RUNTIME_PREPARATION_KEY];
    return true;
  };
}

export function disposeExistingContentRuntime(): void {
  const runtimeGlobal = getContentRuntimeGlobal();
  runtimeGlobal[CONTENT_RUNTIME_PREPARATION_KEY]?.();
  const cleanup = runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
  delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];

  try {
    cleanup?.();
  } catch (error) {
    logger.warn('Failed to dispose previous content runtime before reinjection', error);
  }
}

export function runWhenContentBodyReady(initialize: () => void): () => void {
  if (pendingBodyReadyInitialization) {
    return () => undefined;
  }

  pendingBodyReadyInitialization = true;
  let observer: MutationObserver | null = null;
  let domContentLoadedInstalled = false;
  let active = true;
  let timer: number | undefined;
  let cleanup = () => undefined;
  const initializeWhenReady = () => {
    if (!active || !document.body) {
      return;
    }

    cleanup();
    pendingBodyReadyInitialization = false;
    initialize();
  };
  cleanup = () => {
    if (!active) return;
    active = false;
    pendingBodyReadyInitialization = false;
    window.clearTimeout(timer);
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

  timer = window.setTimeout(initializeWhenReady, 0);
  return cleanup;
}
