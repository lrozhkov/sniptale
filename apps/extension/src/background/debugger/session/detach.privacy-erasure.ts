import { detachDebuggerClient } from './detach-core';
import type { DebuggerClient } from './index';

export async function detachDebuggerForPrivacyErasure(
  tabId: number,
  client: DebuggerClient
): Promise<void> {
  const result = await detachDebuggerClient(tabId, client);
  if (result.status === 'failed') {
    throw new Error('Debugger detach failed during local data erasure');
  }
}
