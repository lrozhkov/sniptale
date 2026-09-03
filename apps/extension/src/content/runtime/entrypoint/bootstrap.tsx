import { createRoot } from 'react-dom/client';
import {
  initializeContentUiRoots,
  getContentUiPageZoomRevision,
  installContentUiScaleCompensation,
  setContentUiPageZoomAtRevision,
} from '../../platform/dom-host';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { createContentEntrypointStyles } from '../../public/preparation-surface/styles';
import {
  createShadowHost,
  createShadowRootWithStyles,
} from '@sniptale/platform/browser/shadow-dom';
import { initializeAppTheme } from '../../../ui/theme';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { App } from '../../overlay/app/view';
import { logTopLevelContentScriptLoad } from './diagnostics';
import { initializeTopLevelContentRuntime } from '../bootstrap';
import { installContentUiActivationBridge } from '../ui-activation-bridge';
import { installContentToastHostAdapter } from '../../platform/dom-host/toast-host';
import { CONTENT_RUNTIME_HOST_ID, CONTENT_RUNTIME_MARKER_ATTRIBUTE } from './markers';
import {
  disposeExistingContentRuntime,
  hasRegisteredContentRuntimeCleanup,
  registerContentRuntimeCleanup,
  runWhenContentBodyReady,
} from './lifecycle';

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
  const visualViewport = window.visualViewport;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewportOffsetX: visualViewport?.offsetLeft ?? 0,
    viewportOffsetY: visualViewport?.offsetTop ?? 0,
    visualViewportScale: visualViewport?.scale ?? 1,
  };
}

function installPageZoomSynchronization(): () => void {
  let disposed = false;
  let requestGeneration = 0;
  const synchronize = () => {
    const generation = ++requestGeneration;
    const pageZoomRevision = getContentUiPageZoomRevision();
    void getContentRuntimeServices()
      .messaging.sendRuntimeMessage({ type: MessageType.SCREENSHOT_MODE_STATUS })
      .then((response) => {
        if (
          !disposed &&
          generation === requestGeneration &&
          response.success &&
          typeof response.pageZoom === 'number'
        ) {
          setContentUiPageZoomAtRevision(response.pageZoom, pageZoomRevision);
        }
      })
      .catch(() => undefined);
  };
  synchronize();
  window.addEventListener('resize', synchronize);
  return () => {
    disposed = true;
    window.removeEventListener('resize', synchronize);
  };
}

/**
 * Boots the top-level content UI and wires its runtime ownership seams.
 */
export function initializeTopLevelContentEntry(): void {
  const existingHost = document.getElementById(CONTENT_RUNTIME_HOST_ID);
  const contentRuntimeMarkerVersion = getContentRuntimeMarkerVersion();
  if (
    existingHost?.getAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE) === contentRuntimeMarkerVersion &&
    hasRegisteredContentRuntimeCleanup()
  ) {
    return;
  }

  disposeExistingContentRuntime();
  existingHost?.remove();

  if (!document.body) {
    runWhenContentBodyReady(initializeTopLevelContentEntry);
    return;
  }

  const host = createShadowHost(CONTENT_RUNTIME_HOST_ID);
  host.setAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE, contentRuntimeMarkerVersion);
  initializeAppTheme('system', host, { applyColorSchemeInline: false });

  const shadow = createShadowRootWithStyles(host, createContentEntrypointStyles());
  const { appContainer } = initializeContentUiRoots(shadow);
  installContentUiActivationBridge(shadow);
  document.body.appendChild(host);
  const disposeContentUiScaleCompensation = installContentUiScaleCompensation(host);

  const root = createRoot(appContainer);
  root.render(<App />);
  const disposeContentRuntime = initializeTopLevelContentRuntime(readWindowViewportInfo);
  const disposePageZoomSynchronization = installPageZoomSynchronization();
  const disposeToastHostAdapter = installContentToastHostAdapter();
  registerContentRuntimeCleanup(() => {
    try {
      disposeContentRuntime();
    } finally {
      try {
        disposeContentUiScaleCompensation();
        disposePageZoomSynchronization();
        disposeToastHostAdapter();
        root.unmount();
      } finally {
        host.remove();
      }
    }
  });

  logTopLevelContentScriptLoad();
}
