import { createLogger } from '@sniptale/platform/observability/logger';
import {
  buildViewportEmulationResult,
  calculateViewportScale,
  type LayoutMetrics,
  type ViewportEmulationResult,
} from './helpers';
import { clearViewportOverride, overrideDeviceMetrics, resetTabZoom } from './commands';
import { fetchLayoutMetrics, getAvailableWorkspace } from './metrics';
export type { ViewportEmulationResult } from './helpers';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspace' });

export async function setViewport(
  tabId: number,
  width: number,
  height: number
): Promise<ViewportEmulationResult> {
  logger.debug('Applying viewport emulation', { tabId, width, height });

  try {
    await clearViewportOverride(tabId);
    const workspace = await getAvailableWorkspace(tabId);
    const { scale, scaleX, scaleY } = calculateViewportScale(workspace, width, height);

    logViewportEmulation(workspace, width, height, scale, scaleX, scaleY);
    await overrideDeviceMetrics(tabId, width, height, scale);
    const layoutMetrics = await fetchLayoutMetrics(tabId);
    const result = buildViewportEmulationResult(layoutMetrics, width, height, scale);

    logLayoutMetrics(layoutMetrics, result);
    return result;
  } catch (error) {
    logger.error('Failed to set viewport', error);
    throw error;
  }
}
function logViewportEmulation(
  workspace: { width: number; height: number },
  width: number,
  height: number,
  scale: number,
  scaleX: number,
  scaleY: number
) {
  logger.debug('Calculated viewport emulation scale', {
    workspace,
    preset: { width, height },
    scaleX: Number(scaleX.toFixed(3)),
    scaleY: Number(scaleY.toFixed(3)),
    scale: Number(scale.toFixed(3)),
  });
}

function logLayoutMetrics(layoutMetrics: LayoutMetrics, result: ViewportEmulationResult) {
  const visualViewport = layoutMetrics.visualViewport;
  const contentSize = layoutMetrics.contentSize;
  logger.debug('Layout metrics after emulation', {
    contentSize: {
      width: contentSize?.width,
      height: contentSize?.height,
    },
    visualViewport: {
      width: visualViewport?.clientWidth,
      height: visualViewport?.clientHeight,
    },
    result,
  });
}

export async function clearViewport(tabId: number): Promise<void> {
  await clearViewportOverride(tabId);
}

export async function resetZoom(tabId: number): Promise<void> {
  await resetTabZoom(tabId);
}
