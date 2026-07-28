import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { withTimeout } from '../infra';
import { DEBUGGER_TIMEOUT_MS } from '../constants';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspaceCommands' });

export async function overrideDeviceMetrics(
  tabId: number,
  width: number,
  height: number
): Promise<void> {
  logger.debug('Calling Emulation.setDeviceMetricsOverride', { tabId, width, height });
  await withTimeout(
    browserDebugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
      positionX: 0,
      positionY: 0,
      scrollbarType: 'overlay',
    }),
    DEBUGGER_TIMEOUT_MS,
    'Emulation.setDeviceMetricsOverride'
  );
  logger.debug('Viewport metrics override applied', {
    width,
    height,
  });
}

export async function clearViewportOverride(tabId: number): Promise<void> {
  logger.debug('Clearing viewport metrics override', { tabId });
  try {
    await withTimeout(
      browserDebugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride'),
      DEBUGGER_TIMEOUT_MS,
      'Emulation.clearDeviceMetricsOverride'
    );
    logger.debug('Viewport metrics override cleared', { tabId });
  } catch (error) {
    logger.error('Failed to clear viewport', error);
    throw error;
  }
}
