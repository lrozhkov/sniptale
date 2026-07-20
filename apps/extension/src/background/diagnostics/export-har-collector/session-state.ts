import { getTabIdByTargetId } from '../../debugger/session';
import { createPrivilegedSyncMemoryDomain } from '../../routing-contracts/capabilities/privileged-authority/state';
import type { ExportHarSession } from './helpers';

const exportHarSessions = createPrivilegedSyncMemoryDomain<ExportHarSession>(
  'background.privileged.export-har-sessions'
);
const exportHarSessionIdsByTab = createPrivilegedSyncMemoryDomain<string>(
  'background.privileged.export-har-session-tabs'
);
const exportHarExpiryTimers = createPrivilegedSyncMemoryDomain<ReturnType<typeof setTimeout>>(
  'background.privileged.export-har-session-timers'
);

export function getExportHarSession(sessionId: string): ExportHarSession | undefined {
  return exportHarSessions.get(sessionId);
}

export function listExportHarSessions(): ExportHarSession[] {
  return [...exportHarSessions.entries()].map(([, session]) => session);
}

export function hasExportHarSession(sessionId: string): boolean {
  return exportHarSessions.has(sessionId);
}

export function getExportHarSessionIdForTab(tabId: number): string | undefined {
  return exportHarSessionIdsByTab.get(String(tabId));
}

export function registerExportHarSession(
  session: ExportHarSession,
  expiryTimer?: ReturnType<typeof setTimeout>
): void {
  exportHarSessions.set(session.sessionId, session);
  exportHarSessionIdsByTab.set(String(session.tabId), session.sessionId);
  if (expiryTimer) {
    exportHarExpiryTimers.set(session.sessionId, expiryTimer);
  }
}

export function clearExportHarSession(sessionId: string): void {
  const session = exportHarSessions.get(sessionId);
  if (!session) {
    return;
  }

  const expiryTimer = exportHarExpiryTimers.get(sessionId);
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    exportHarExpiryTimers.delete(sessionId);
  }

  exportHarSessionIdsByTab.delete(String(session.tabId));
  exportHarSessions.delete(sessionId);
}

export function clearExportHarSessionForTab(tabId: number): void {
  const sessionId = exportHarSessionIdsByTab.get(String(tabId));
  if (!sessionId) {
    return;
  }

  const expiryTimer = exportHarExpiryTimers.get(sessionId);
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    exportHarExpiryTimers.delete(sessionId);
  }

  exportHarSessionIdsByTab.delete(String(tabId));
  exportHarSessions.delete(sessionId);
}

export function getExportHarSessionForSource(
  source: chrome.debugger.Debuggee
): ExportHarSession | null {
  const tabId = source.tabId ?? (source.targetId ? getTabIdByTargetId(source.targetId) : undefined);
  if (!tabId) {
    return null;
  }

  const sessionId = exportHarSessionIdsByTab.get(String(tabId));
  return sessionId ? (exportHarSessions.get(sessionId) ?? null) : null;
}
