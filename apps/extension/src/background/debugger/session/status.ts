import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { withTimeout } from '../infra';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { hasAttachedClient } from './index';
import type { DebuggerClient } from './index';

const logger = createLogger({ namespace: 'BackgroundDebuggerStatus' });

export async function isDebuggerAttached(tabId: number, client?: DebuggerClient): Promise<boolean> {
  if (client) {
    const isAttached = hasAttachedClient(tabId, client);
    logger.debug('Client attached status resolved', { client, isAttached, tabId });
    return isAttached;
  }

  try {
    const targets = await withTimeout(
      browserDebugger.getTargets(),
      DEBUGGER_TIMEOUT_MS,
      'debugger.getTargets'
    );
    const attached = targets.some((target) => target.tabId === tabId && target.attached);
    logger.debug('Debugger attached status resolved', { attached, tabId });
    return attached;
  } catch (error) {
    logger.error('Failed to check debugger status', error);
    return false;
  }
}
