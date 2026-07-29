import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserScripting } from '@sniptale/platform/browser/scripting';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { withTimeout } from '../infra';
import {
  buildViewportCompositorScale,
  buildViewportEmulationResult,
  type ViewportEmulationResult,
} from './helpers';

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

export async function readViewportCompositorScale(tabId: number): Promise<number> {
  logger.debug('Reading viewport compositor scale from CDP layout metrics', { tabId });
  const metrics = await withTimeout(
    browserDebugger.sendCommand<unknown>({ tabId }, 'Page.getLayoutMetrics'),
    DEBUGGER_TIMEOUT_MS,
    'Page.getLayoutMetrics'
  );
  return buildViewportCompositorScale(metrics);
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
