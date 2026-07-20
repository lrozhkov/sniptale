import { acquireDiagnosticsMutationPermit } from '../lifecycle-gate';
import type { ExportHarSession } from './helpers';
import { detachExportHarSession } from './session-lifecycle';
import { isExportHarSessionExpired } from './session-factory';
import { getExportHarSession } from './session-state';

export function scheduleExportHarSessionExpiry(
  session: ExportHarSession
): ReturnType<typeof setTimeout> {
  const delayMs = Math.max(0, session.expiresAtEpochMs - Date.now());
  return setTimeout(() => {
    const currentSession = getExportHarSession(session.sessionId);
    if (currentSession === session && isExportHarSessionExpired(currentSession)) {
      const releaseMutation = acquireDiagnosticsMutationPermit();
      if (!releaseMutation) return;
      void detachExportHarSession(currentSession).finally(releaseMutation);
    }
  }, delayMs);
}
