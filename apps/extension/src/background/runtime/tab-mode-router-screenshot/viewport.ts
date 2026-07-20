import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendTabMessage } from '../../../platform/runtime-messaging';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import {
  armDebuggerActivation,
  attachDebugger,
  clearViewport,
  detachDebugger,
  isDebuggerAttached,
  resetZoom,
  setViewport,
} from '../../diagnostics/lifecycle';
import { sendViewerPreparationCommand, type WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { createViewportStateSnapshot } from './helpers';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ScreenshotViewport,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

async function notifyViewportChanged(tabId: number, viewport: ScreenshotViewport): Promise<void> {
  await sendTabMessage(tabId, {
    type: MessageType.VIEWPORT_CHANGED,
    viewport,
  });
}

export async function handleSetViewport(
  tabId: number,
  width: number | undefined | null,
  height: number | undefined | null,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, () =>
    handleSetViewportOperation(
      tabId,
      width,
      height,
      viewportState,
      viewportOwnerState,
      webSnapshotViewerPorts
    )
  );
}

async function handleSetViewportOperation(
  tabId: number,
  width: number | undefined | null,
  height: number | undefined | null,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts
): Promise<void> {
  const tab = await browserTabs.get(tabId);
  const capability = classifyTabRuntimeCapability(tab);
  if (capability === TabRuntimeCapability.OwnedSnapshotViewer) {
    await handleOwnedSnapshotViewerViewport(
      tabId,
      width,
      height,
      viewportState,
      viewportOwnerState,
      webSnapshotViewerPorts
    );
    return;
  }
  if (capability === TabRuntimeCapability.Restricted) {
    throw new Error('Viewport emulation is unavailable for this page.');
  }

  const previousViewport = viewportState.get(tabId) ?? null;

  try {
    const viewport = createViewportStateSnapshot(width, height);
    if (!viewport) {
      await switchToNativeViewport(tabId, viewportState, viewportOwnerState);
    } else {
      await applyCustomViewport(tabId, viewport, viewportState, viewportOwnerState);
    }
  } catch (error) {
    logger.error('Failed to update screenshot viewport', error);
    viewportState.set(tabId, previousViewport);
    throw error;
  }
}

async function handleOwnedSnapshotViewerViewport(
  tabId: number,
  width: number | undefined | null,
  height: number | undefined | null,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  ports: WebSnapshotViewerPorts
): Promise<void> {
  const previousViewport = viewportState.get(tabId) ?? null;
  const viewport = createViewportStateSnapshot(width, height);

  try {
    await sendViewerPreparationCommand(ports, tabId, {
      type: MessageType.SET_VIEWPORT,
      viewport,
    });
    if (viewport) {
      viewportOwnerState.set(tabId, 'viewer');
    } else {
      viewportOwnerState.delete(tabId);
    }
    viewportState.set(tabId, viewport);
  } catch (error) {
    viewportState.set(tabId, previousViewport);
    throw error;
  }
}

async function switchToNativeViewport(
  tabId: number,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState
): Promise<void> {
  viewportOwnerState.delete(tabId);
  viewportState.set(tabId, null);

  notifyViewportChanged(tabId, null).catch((error) => {
    logger.warn('Failed to notify content script about native viewport switch', error);
  });

  const attached = await isDebuggerAttached(tabId);
  if (!attached) {
    return;
  }

  try {
    await clearViewport(tabId);
  } catch (error) {
    logger.warn('Failed to clear viewport before returning to native mode', error);
  }

  try {
    await detachDebugger(tabId, 'screenshot');
  } catch (error) {
    logger.warn('Failed to detach debugger after switching to native viewport', error);
  }
}

async function applyCustomViewport(
  tabId: number,
  viewport: Exclude<ScreenshotViewport, null>,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState
): Promise<void> {
  const previousViewport = viewportState.get(tabId) ?? null;
  const wasAttachedBefore = await isDebuggerAttached(tabId);
  if (!wasAttachedBefore) {
    await attachDebugger(
      tabId,
      'screenshot',
      armDebuggerActivation({ client: 'screenshot', reason: 'set-screenshot-viewport', tabId })
    );
  }

  await setViewport(tabId, viewport.width, viewport.height);
  await resetZoom(tabId);

  try {
    await notifyViewportChanged(tabId, viewport);
  } catch (error) {
    await rollbackCustomViewportChange(tabId, previousViewport, wasAttachedBefore);
    viewportState.set(tabId, previousViewport);
    if (previousViewport) {
      viewportOwnerState.set(tabId, 'debugger');
    } else {
      viewportOwnerState.delete(tabId);
    }
    throw error;
  }

  viewportOwnerState.set(tabId, 'debugger');
  viewportState.set(tabId, viewport);
  logger.debug('Applied custom screenshot viewport', {
    tabId,
    viewport,
  });
}

async function rollbackCustomViewportChange(
  tabId: number,
  previousViewport: ScreenshotViewport,
  wasAttachedBefore: boolean
): Promise<void> {
  if (!previousViewport) {
    try {
      await clearViewport(tabId);
    } catch (error) {
      logger.warn('Failed to clear viewport during rollback after viewport update error', error);
    }

    if (!wasAttachedBefore) {
      try {
        await detachDebugger(tabId, 'screenshot');
      } catch (error) {
        logger.warn('Failed to detach debugger during rollback after viewport update error', error);
      }
    }

    return;
  }

  try {
    await setViewport(tabId, previousViewport.width, previousViewport.height);
    await resetZoom(tabId);
  } catch (error) {
    logger.warn('Failed to restore previous viewport after viewport update error', error);
  }
}
