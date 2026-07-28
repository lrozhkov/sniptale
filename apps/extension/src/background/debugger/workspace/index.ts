import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportEmulationResult } from './helpers';
import { clearViewportOverride, overrideDeviceMetrics } from './commands';
import { readIsolatedViewportMetrics, waitForIsolatedViewportPaint } from './metrics';
export type { ViewportEmulationResult } from './helpers';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspace' });

export async function getViewportWorkspace(tabId: number) {
  const viewport = await readIsolatedViewportMetrics(tabId);
  return { width: viewport.cssWidth, height: viewport.cssHeight };
}

export class ViewportMutationError extends Error {
  constructor(
    message: string,
    readonly observed: ViewportEmulationResult
  ) {
    super(message);
    this.name = 'ViewportMutationError';
  }
}

export async function setViewport(
  tabId: number,
  width: number,
  height: number
): Promise<ViewportEmulationResult> {
  await overrideDeviceMetrics(tabId, width, height);
  await waitForIsolatedViewportPaint(tabId);
  const result = await readIsolatedViewportMetrics(tabId);
  if (result.cssWidth !== width || result.cssHeight !== height) {
    throw new ViewportMutationError(
      `Viewport verification failed: requested ${width}x${height}, received ${result.cssWidth}x${result.cssHeight}`,
      result
    );
  }
  logger.debug('Applied exact viewport metrics', { tabId, width, height });
  return result;
}

export async function clearViewport(tabId: number): Promise<void> {
  await clearViewportOverride(tabId);
}
