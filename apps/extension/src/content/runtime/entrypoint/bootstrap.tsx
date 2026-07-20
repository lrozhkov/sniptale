import { createRoot } from 'react-dom/client';
import { initializeContentUiRoots } from '../../platform/dom-host';
import { createContentEntrypointStyles } from '../../public/preparation-surface/styles';
import {
  createShadowHost,
  createShadowRootWithStyles,
} from '@sniptale/platform/browser/shadow-dom';
import { initializeAppTheme } from '../../../ui/theme';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { App } from '../../overlay/app/view';
import { logRegionCaptureApiSupport, logTopLevelContentScriptLoad } from './diagnostics';
import { initializeTopLevelContentRuntime, type ContentRuntimeCleanup } from '../bootstrap';
import { installContentUiActivationBridge } from '../ui-activation-bridge';
import { installContentToastHostAdapter } from '../../platform/dom-host/toast-host';
import {
  CONTENT_RUNTIME_CLEANUP_KEY,
  CONTENT_RUNTIME_HOST_ID,
  CONTENT_RUNTIME_MARKER_ATTRIBUTE,
} from './markers';

const logger = createLogger({ namespace: 'ContentEntrypointBootstrap' });
let pendingBodyReadyInitialization = false;

type ContentRuntimeGlobal = typeof globalThis & {
  [CONTENT_RUNTIME_CLEANUP_KEY]?: ContentRuntimeCleanup;
};

function getContentRuntimeMarkerVersion(): string {
  if (
    typeof __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__ === 'string' &&
    __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__.length > 0
  ) {
    return `dynamic-${__SNIPTALE_CONTENT_RUNTIME_BUILD_ID__}`;
  }

  try {
    return `dynamic-manifest-${runtimeInfo.getManifest().version}`;
  } catch {
    return 'dynamic-dev';
  }
}

function readWindowViewportInfo(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function getContentRuntimeGlobal(): ContentRuntimeGlobal {
  return globalThis as ContentRuntimeGlobal;
}

function disposeExistingContentRuntime(): void {
  const runtimeGlobal = getContentRuntimeGlobal();
  const cleanup = runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
  delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];

  try {
    cleanup?.();
  } catch (error) {
    logger.warn('Failed to dispose previous content runtime before reinjection', error);
  }
}

function runWhenBodyReady(): void {
  if (pendingBodyReadyInitialization) {
    return;
  }

  pendingBodyReadyInitialization = true;
  let observer: MutationObserver | null = null;
  let domContentLoadedInstalled = false;
  let cleanup = () => undefined;
  const initialize = () => {
    if (!document.body) {
      return;
    }

    cleanup();
    pendingBodyReadyInitialization = false;
    initializeTopLevelContentEntry();
  };
  cleanup = () => {
    observer?.disconnect();
    if (domContentLoadedInstalled) {
      document.removeEventListener('DOMContentLoaded', initialize);
    }
  };

  if (document.readyState === 'loading') {
    domContentLoadedInstalled = true;
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  }

  if (typeof MutationObserver === 'function' && document.documentElement) {
    observer = new MutationObserver(initialize);
    observer.observe(document.documentElement, { childList: true });
  }

  window.setTimeout(initialize, 0);
}

/**
 * Boots the top-level content UI and wires its runtime ownership seams.
 */
export function initializeTopLevelContentEntry(): void {
  const existingHost = document.getElementById(CONTENT_RUNTIME_HOST_ID);
  const contentRuntimeMarkerVersion = getContentRuntimeMarkerVersion();
  if (
    existingHost?.getAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE) === contentRuntimeMarkerVersion
  ) {
    return;
  }

  disposeExistingContentRuntime();
  existingHost?.remove();

  if (!document.body) {
    runWhenBodyReady();
    return;
  }

  const host = createShadowHost(CONTENT_RUNTIME_HOST_ID);
  host.setAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE, contentRuntimeMarkerVersion);
  initializeAppTheme('system', host, { applyColorSchemeInline: false });

  const shadow = createShadowRootWithStyles(host, createContentEntrypointStyles());
  const { appContainer } = initializeContentUiRoots(shadow);
  installContentUiActivationBridge(shadow);
  document.body.appendChild(host);

  const root = createRoot(appContainer);
  root.render(<App />);
  const disposeContentRuntime = initializeTopLevelContentRuntime(readWindowViewportInfo);
  const disposeToastHostAdapter = installContentToastHostAdapter();
  getContentRuntimeGlobal()[CONTENT_RUNTIME_CLEANUP_KEY] = () => {
    try {
      disposeContentRuntime();
    } finally {
      disposeToastHostAdapter();
      root.unmount();
      host.remove();
      delete getContentRuntimeGlobal()[CONTENT_RUNTIME_CLEANUP_KEY];
    }
  };

  logTopLevelContentScriptLoad();
  logRegionCaptureApiSupport();
}
