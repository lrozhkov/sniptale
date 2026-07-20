import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { withTimeout } from '../infra';
import { getAttachedClients, releaseAttachedClient, type DebuggerClient } from './index';

type DebuggerDetachResult =
  | { status: 'not-owned' }
  | { status: 'released-shared' }
  | { status: 'detached' }
  | { status: 'already-detached' }
  | { error: unknown; status: 'failed' };

export async function detachDebuggerClient(
  tabId: number,
  client: DebuggerClient
): Promise<DebuggerDetachResult> {
  const clients = getAttachedClients(tabId);
  if (!clients.includes(client)) return { status: 'not-owned' };
  if (clients.length > 1) {
    releaseAttachedClient(tabId, client);
    return { status: 'released-shared' };
  }

  try {
    await withTimeout(browserDebugger.detach({ tabId }), DEBUGGER_TIMEOUT_MS, 'debugger.detach');
  } catch (error) {
    if (!isAlreadyDetachedError(error)) return { error, status: 'failed' };
    releaseAttachedClient(tabId, client);
    return { status: 'already-detached' };
  }
  releaseAttachedClient(tabId, client);
  return { status: 'detached' };
}

function isAlreadyDetachedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Not attached');
}
