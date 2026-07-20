import { delay } from '@sniptale/foundation/utils/delay';
import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { armDebuggerActivation } from '../../debugger/session/activation';
import { attachDebugger } from '../../debugger/session/attach';
import { detachDebugger } from '../../debugger/session/detach';
import { hideFixedElements, restoreFixedElements, scrollPage } from '../page-state/index';

const logger = createLogger({ namespace: 'BackgroundFullPageCapture' });

export async function prepareCaptureEnvironment(tabId: number): Promise<void> {
  await hideFixedElements(tabId);
  await delay(300);
  await attachDebugger(
    tabId,
    'screenshot',
    armDebuggerActivation({ client: 'screenshot', reason: 'full-page-capture', tabId })
  );
  await ensurePageEnabled(tabId);
  await delay(200);
}

async function ensurePageEnabled(tabId: number): Promise<void> {
  try {
    await browserDebugger.sendCommand({ tabId }, 'Page.enable');
  } catch (error) {
    logger.debug('Page.enable failed or was already active', error);
  }
}

export async function finalizeCapture(tabId: number): Promise<void> {
  await detachDebugger(tabId, 'screenshot');
  await restoreFixedElements(tabId);
  await scrollPage(tabId, 0);
}

export async function cleanupCapture(tabId: number): Promise<void> {
  await runCleanupStep('detach debugger', () => detachDebugger(tabId, 'screenshot'));
  await runCleanupStep('restore fixed elements', () => restoreFixedElements(tabId));
  await runCleanupStep('reset scroll position', () => scrollPage(tabId, 0));
}

async function runCleanupStep(label: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    logger.warn(`Failed to ${label} during full-page capture cleanup`, error);
  }
}
