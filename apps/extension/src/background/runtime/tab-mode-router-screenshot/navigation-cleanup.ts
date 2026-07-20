import { createLogger } from '@sniptale/platform/observability/logger';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { clearViewport, detachDebugger } from '../../diagnostics/lifecycle';
import { disablePreparationByCapability } from '../../capture/routes';
import type { WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ModeState,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

async function disablePreparationAfterNavigation(
  tabId: number,
  capability: TabRuntimeCapability,
  webSnapshotViewerPorts: WebSnapshotViewerPorts
): Promise<void> {
  try {
    await disablePreparationByCapability({
      capability,
      ports: webSnapshotViewerPorts,
      tabId,
    });
  } catch (error) {
    logger.warn('Failed to notify screenshot mode cleanup after navigation', error);
  }
}

async function clearViewportPresetAfterNavigation(tabId: number): Promise<void> {
  try {
    await clearViewport(tabId);
  } catch (error) {
    logger.warn('Failed to clear viewport after screenshot-mode navigation cleanup', error);
  }

  try {
    await detachDebugger(tabId, 'screenshot');
  } catch (error) {
    logger.warn('Failed to detach debugger after screenshot-mode navigation cleanup', error);
  }
}

export async function cleanupScreenshotModeAfterNavigation(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    const wasScreenshotModeEnabled = screenshotModeState.get(tabId) === true;
    const activeViewport = viewportState.get(tabId) ?? null;
    const activeViewportOwner = viewportOwnerState.get(tabId) ?? null;
    const cleanupCapability =
      activeViewportOwner === 'viewer' || webSnapshotViewerPorts.has(tabId)
        ? TabRuntimeCapability.OwnedSnapshotViewer
        : TabRuntimeCapability.Regular;

    screenshotModeState.delete(tabId);
    viewportOwnerState.delete(tabId);
    viewportState.delete(tabId);

    if (!wasScreenshotModeEnabled && activeViewport === null) {
      webSnapshotViewerPorts.delete(tabId);
      return;
    }

    logger.log('Cleaning screenshot mode after top-level navigation', { tabId });
    await disablePreparationAfterNavigation(tabId, cleanupCapability, webSnapshotViewerPorts);
    webSnapshotViewerPorts.delete(tabId);

    if (activeViewport !== null && activeViewportOwner === 'debugger') {
      await clearViewportPresetAfterNavigation(tabId);
    }
  });
}
