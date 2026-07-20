import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { getScreenshotModeCapability } from '../../../features/tab-capabilities/capabilities';
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
import {
  disablePreparationByCapability,
  enablePreparationByCapability,
} from '../../capture/routes';
import type { WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { resolveDefaultScreenshotViewport } from './helpers';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ModeState,
  ScreenshotViewport,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotMode' });

async function notifyScreenshotModeEnabled(
  tabId: number,
  viewport: ScreenshotViewport | undefined,
  ports: WebSnapshotViewerPorts,
  capability: TabRuntimeCapability
): Promise<void> {
  await enablePreparationByCapability({
    capability,
    ports,
    tabId,
    viewport: viewport ?? null,
  });
}

async function applyViewportPreset(
  tabId: number,
  viewport: Exclude<ScreenshotViewport, null>
): Promise<{ wasAttachedBefore: boolean }> {
  const wasAttachedBefore = await isDebuggerAttached(tabId);
  if (!wasAttachedBefore) {
    await attachDebugger(
      tabId,
      'screenshot',
      armDebuggerActivation({ client: 'screenshot', reason: 'enable-screenshot-mode', tabId })
    );
  }
  await setViewport(tabId, viewport.width, viewport.height);
  await resetZoom(tabId);
  return { wasAttachedBefore };
}

async function rollbackViewportPreset(tabId: number, wasAttachedBefore: boolean): Promise<void> {
  try {
    await clearViewport(tabId);
  } catch (error) {
    logger.warn('Failed to clear viewport after screenshot-mode setup error', error);
  }

  if (wasAttachedBefore) {
    return;
  }

  try {
    await detachDebugger(tabId, 'screenshot');
  } catch (error) {
    logger.warn('Failed to detach debugger after screenshot-mode setup error', error);
  }
}

async function enablePresetScreenshotMode(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  viewport: Exclude<ScreenshotViewport, null>;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
}): Promise<void> {
  const viewportApply = await applyViewportPreset(args.tabId, args.viewport);

  try {
    await notifyScreenshotModeEnabled(args.tabId, args.viewport, args.ports, args.capability);
  } catch (error) {
    args.viewportOwnerState.delete(args.tabId);
    args.viewportState.set(args.tabId, null);
    await rollbackViewportPreset(args.tabId, viewportApply.wasAttachedBefore);
    throw error;
  }

  args.viewportOwnerState.set(args.tabId, 'debugger');
  args.viewportState.set(args.tabId, args.viewport);
  logger.debug('Applied default screenshot viewport preset', {
    tabId: args.tabId,
    viewport: args.viewport,
  });
}

async function enableNativeScreenshotMode(args: {
  capability: TabRuntimeCapability;
  ports: WebSnapshotViewerPorts;
  tabId: number;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
}): Promise<void> {
  args.viewportOwnerState.delete(args.tabId);
  args.viewportState.set(args.tabId, null);
  await notifyScreenshotModeEnabled(args.tabId, null, args.ports, args.capability);
  logger.debug('Using native screenshot viewport', { tabId: args.tabId });
}

export async function enableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    try {
      const tab = await browserTabs.get(tabId);
      const screenshotCapability = getScreenshotModeCapability(tab);
      if (!screenshotCapability.supported) {
        throw new Error(
          screenshotCapability.reason || translate('background.runtime.pagePrepUnavailable')
        );
      }
      const capability = classifyTabRuntimeCapability(tab);

      const settings = await loadSettings();
      const defaultViewport = resolveDefaultScreenshotViewport(settings);

      if (defaultViewport && capability === TabRuntimeCapability.Regular) {
        await enablePresetScreenshotMode({
          capability,
          ports: webSnapshotViewerPorts,
          tabId,
          viewport: defaultViewport,
          viewportOwnerState,
          viewportState,
        });
      } else {
        await enableNativeScreenshotMode({
          capability,
          ports: webSnapshotViewerPorts,
          tabId,
          viewportOwnerState,
          viewportState,
        });
      }

      screenshotModeState.set(tabId, true);
      logger.debug('Enabled screenshot mode', { tabId });
    } catch (error) {
      logger.error('Failed to enable screenshot mode', error);
      throw error;
    }
  });
}

export async function disableScreenshotMode(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    try {
      logger.log('Disabling screenshot mode', { tabId });

      const tab = await browserTabs.get(tabId);
      const capability = classifyTabRuntimeCapability(tab);
      await disablePreparationByCapability({
        capability,
        ports: webSnapshotViewerPorts,
        tabId,
      });

      const viewportOwner = viewportOwnerState.get(tabId) ?? null;
      if (capability === TabRuntimeCapability.Regular && viewportOwner === 'debugger') {
        try {
          await clearViewport(tabId);
        } catch (error) {
          logger.warn('Failed to clear viewport before disabling screenshot mode', error);
        }

        await detachDebugger(tabId, 'screenshot');
      }
      viewportOwnerState.delete(tabId);
      viewportState.delete(tabId);
      screenshotModeState.delete(tabId);
      logger.debug('Disabled screenshot mode', { tabId });
    } catch (error) {
      logger.error('Failed to disable screenshot mode', error);
      throw error;
    }
  });
}
