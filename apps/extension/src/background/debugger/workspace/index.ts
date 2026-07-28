import { createLogger } from '@sniptale/platform/observability/logger';
import { viewportCompositorScalesMatch, type ViewportEmulationResult } from './helpers';
import { clearViewportOverride, overrideDeviceMetrics } from './commands';
import {
  readIsolatedViewportMetrics,
  readViewportCompositorScale,
  waitForIsolatedViewportPaint,
} from './metrics';
export type { ViewportEmulationResult } from './helpers';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspace' });

export async function getViewportWorkspace(tabId: number) {
  const viewport = await readIsolatedViewportMetrics(tabId);
  return { width: viewport.cssWidth, height: viewport.cssHeight };
}

export class ViewportMutationError extends Error {
  constructor(
    message: string,
    readonly observed: ViewportEmulationResult,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ViewportMutationError';
  }
}

async function applyViewport(
  tabId: number,
  width: number,
  height: number,
  compositorScale: number
): Promise<{ compositorScale: number; result: ViewportEmulationResult }> {
  await overrideDeviceMetrics(tabId, width, height, compositorScale);
  await waitForIsolatedViewportPaint(tabId);
  const result = await readIsolatedViewportMetrics(tabId);
  if (result.cssWidth !== width || result.cssHeight !== height) {
    throw new ViewportMutationError(
      `Viewport verification failed: requested ${width}x${height}, received ${result.cssWidth}x${result.cssHeight}`,
      result
    );
  }
  try {
    return { compositorScale: await readViewportCompositorScale(tabId), result };
  } catch (error) {
    throw new ViewportMutationError('Viewport compositor verification failed', result, {
      cause: error,
    });
  }
}

export async function setViewport(
  tabId: number,
  width: number,
  height: number
): Promise<ViewportEmulationResult> {
  let requestedCompositorScale = await readViewportCompositorScale(tabId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const applied = await applyViewport(tabId, width, height, requestedCompositorScale);
    if (viewportCompositorScalesMatch(requestedCompositorScale, applied.compositorScale)) {
      logger.debug('Applied exact viewport metrics', {
        tabId,
        width,
        height,
        compositorScale: applied.compositorScale,
      });
      return applied.result;
    }
    if (attempt === 0) {
      requestedCompositorScale = applied.compositorScale;
      continue;
    }
    throw new ViewportMutationError(
      'Viewport compositor scale changed during verification',
      applied.result
    );
  }
  throw new Error('Viewport compositor verification exhausted');
}

export async function clearViewport(tabId: number): Promise<void> {
  await clearViewportOverride(tabId);
}
