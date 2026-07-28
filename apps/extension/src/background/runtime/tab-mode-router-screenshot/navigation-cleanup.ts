import { createLogger } from '@sniptale/platform/observability/logger';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { disablePreparationByCapability } from '../../capture/routes';
import type { WebSnapshotViewerPorts } from '../../capture/lifecycle';
import {
  forgetQuickActionSurfaceTransaction,
  releaseQuickActionSurface,
} from '../../capture/quick-actions/flow/surface';
import { getCaptureSurfaceService } from '../../capture-surface';
import { endScreenshotSurfaceSession } from '../../capture-surface/screenshot-session';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ModeState,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

export async function cleanupScreenshotModeAfterNavigation(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    const owner = viewportOwnerState.get(tabId);
    const capability =
      owner === 'viewer' || webSnapshotViewerPorts.has(tabId)
        ? TabRuntimeCapability.OwnedSnapshotViewer
        : TabRuntimeCapability.Regular;
    await disablePreparationByCapability({
      capability,
      ports: webSnapshotViewerPorts,
      tabId,
    }).catch((error) => logger.warn('Failed to disable preparation after navigation', error));
    await releaseQuickActionSurface(tabId, viewportState);
    if (capability === TabRuntimeCapability.Regular) {
      await getCaptureSurfaceService().releaseTabOwners(tabId, ['quick-action', 'screenshot']);
    }
    endScreenshotSurfaceSession(tabId);
    screenshotModeState.delete(tabId);
    viewportOwnerState.delete(tabId);
    viewportState.delete(tabId);
    webSnapshotViewerPorts.delete(tabId);
  });
}

export async function cleanupScreenshotModeAfterTabClose(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    await getCaptureSurfaceService().terminateClosedTab(tabId, ['quick-action', 'screenshot']);
    forgetQuickActionSurfaceTransaction(tabId);
    endScreenshotSurfaceSession(tabId);
    screenshotModeState.delete(tabId);
    viewportOwnerState.delete(tabId);
    viewportState.delete(tabId);
    webSnapshotViewerPorts.delete(tabId);
  });
}
