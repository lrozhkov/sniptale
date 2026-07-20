import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { detachDebuggerForPrivacyErasure } from '../../debugger/session/detach.privacy-erasure';
import { clearExportHarSession, listExportHarSessions } from './session-state';
import { listAttachedDebuggerClientOwners } from '../../debugger/session';

export async function quiesceExportHarSessionsForPrivacyErasure(): Promise<void> {
  for (const session of listExportHarSessions()) {
    await browserDebugger.sendCommand({ tabId: session.tabId }, 'Network.disable');
    await detachDebuggerForPrivacyErasure(session.tabId, 'export-har');
    clearExportHarSession(session.sessionId);
  }

  for (const owner of listAttachedDebuggerClientOwners('export-har')) {
    await browserDebugger.sendCommand({ tabId: owner.tabId }, 'Network.disable');
    await detachDebuggerForPrivacyErasure(owner.tabId, 'export-har');
  }

  if (
    listExportHarSessions().length > 0 ||
    listAttachedDebuggerClientOwners('export-har').length > 0
  ) {
    throw new Error('HAR session cleanup verification failed');
  }
}
