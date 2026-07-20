import { createLogger } from '@sniptale/platform/observability/logger';
import { detachDebuggerClient } from './detach-core';
import type { DebuggerClient } from './index';

const logger = createLogger({ namespace: 'BackgroundDebuggerDetach' });

export async function detachDebugger(tabId: number, client: DebuggerClient): Promise<void> {
  const result = await detachDebuggerClient(tabId, client);
  if (result.status === 'detached') {
    logger.log('Successfully detached from tab', tabId);
  } else if (result.status === 'already-detached') {
    logger.log('Not attached, skipping detach');
  } else if (result.status === 'failed') {
    logger.error('Failed to detach', result.error);
  }
}
