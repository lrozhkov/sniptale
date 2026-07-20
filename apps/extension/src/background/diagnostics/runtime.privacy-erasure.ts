import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../routing-contracts/runtime-messaging/services';
import { disableDiagnosticsDomainsForPrivacyErasure } from '../debugger/privacy-erasure';
import { hasAttachedClient, listAttachedDebuggerClientOwners } from '../debugger/session';
import { detachDebuggerForPrivacyErasure } from '../debugger/session/detach.privacy-erasure';

export async function shutDownDiagnosticsSessionForPrivacyErasure(
  session: ActiveDiagnosticsSession
): Promise<void> {
  if (hasAttachedClient(session.tabId, 'diagnostics')) {
    await disableDiagnosticsDomainsForPrivacyErasure(session.tabId);
    await detachDebuggerForPrivacyErasure(session.tabId, 'diagnostics');
  }
  await getBackgroundRuntimeMessaging().sendTabMessage(session.tabId, {
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  });
  if (hasAttachedClient(session.tabId, 'diagnostics')) {
    throw new Error('Diagnostics debugger cleanup verification failed');
  }
}

export async function quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure(): Promise<void> {
  for (const owner of listAttachedDebuggerClientOwners('diagnostics')) {
    await disableDiagnosticsDomainsForPrivacyErasure(owner.tabId);
    await detachDebuggerForPrivacyErasure(owner.tabId, 'diagnostics');
  }
  if (listAttachedDebuggerClientOwners('diagnostics').length > 0) {
    throw new Error('Diagnostics debugger owner cleanup verification failed');
  }
}
