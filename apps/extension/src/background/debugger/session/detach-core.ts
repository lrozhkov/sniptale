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

/**
 * Completes cleanup authorized by a durable owner lease after an MV3 worker restart.
 * A cold worker has no volatile client state, so absence from the in-memory store is
 * not evidence that Chrome already detached the extension debugger session.
 */
export async function detachPersistedDebuggerClient(
  tabId: number,
  client: DebuggerClient
): Promise<void> {
  const clients = getAttachedClients(tabId);
  if (clients.length > 0) {
    if (!clients.includes(client)) {
      throw new Error('Persisted debugger cleanup conflicts with a current debugger owner');
    }
    const result = await detachDebuggerClient(tabId, client);
    if (result.status === 'failed') {
      if (isMissingDebuggerTargetError(result.error)) {
        releaseAttachedClient(tabId, client);
        return;
      }
      throw result.error;
    }
    return;
  }

  try {
    await withTimeout(browserDebugger.detach({ tabId }), DEBUGGER_TIMEOUT_MS, 'debugger.detach');
  } catch (error) {
    if (!isAlreadyDetachedError(error) && !isMissingDebuggerTargetError(error)) throw error;
  }
}

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

function isMissingDebuggerTargetError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('no tab with id');
}
