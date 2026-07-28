import { browserScripting } from '@sniptale/platform/browser/scripting';
import { createLogger } from '@sniptale/platform/observability/logger';
import { buildViewportEmulationResult, type ViewportEmulationResult } from './helpers';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspaceMetrics' });

export async function readIsolatedViewportMetrics(tabId: number): Promise<ViewportEmulationResult> {
  logger.debug('Reading exact window viewport metrics in an isolated world', { tabId });
  const results = await browserScripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: () => ({ width: window.innerWidth, height: window.innerHeight }),
  });
  return buildViewportEmulationResult(results?.[0]?.result);
}

export async function waitForIsolatedViewportPaint(tabId: number): Promise<void> {
  await browserScripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  });
}
