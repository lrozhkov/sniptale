import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { withTimeout } from '../infra';
import { DEBUGGER_TIMEOUT_MS } from '../constants';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspaceCommands' });

export async function overrideDeviceMetrics(
  tabId: number,
  width: number,
  height: number,
  scale: number
): Promise<void> {
  logger.debug('Calling Emulation.setDeviceMetricsOverride', { tabId, width, height });
  await withTimeout(
    browserDebugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      scale,
      screenWidth: width,
      screenHeight: height,
      positionX: 0,
      positionY: 0,
    }),
    DEBUGGER_TIMEOUT_MS,
    'Emulation.setDeviceMetricsOverride'
  );
  logger.debug('Viewport metrics override applied', {
    width,
    height,
    scale: Number(scale.toFixed(3)),
  });
}

export async function clearViewportOverride(tabId: number): Promise<void> {
  logger.debug('Clearing viewport emulation', { tabId });
  try {
    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride'),
      DEBUGGER_TIMEOUT_MS,
      'Emulation.clearDeviceMetricsOverride'
    );
    logger.debug('Viewport emulation cleared', { tabId });
  } catch (error) {
    logger.error('Failed to clear viewport', error);
    throw error;
  }
}

export async function resetTabZoom(tabId: number): Promise<void> {
  try {
    await browserTabs.setZoom(tabId, 1);
    logger.debug('Reset tab zoom to 100%', { tabId });
  } catch (error) {
    logger.error('Failed to reset zoom', error);
    throw error;
  }
}
