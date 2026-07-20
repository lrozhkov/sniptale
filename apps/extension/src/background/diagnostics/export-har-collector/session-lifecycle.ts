import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { detachDebugger } from '../../debugger/session/detach';
import { acquireDiagnosticsMutationPermit } from '../lifecycle-gate';
import type { ExportHarSession } from './helpers';
import { isExportHarSessionExpired } from './session-factory';
import {
  clearExportHarSession,
  clearExportHarSessionForTab,
  getExportHarSession,
  getExportHarSessionIdForTab,
} from './session-state';

const logger = createLogger({ namespace: 'ExportHAR' });

export async function detachExportHarSession(session: ExportHarSession): Promise<void> {
  try {
    await browserDebugger.sendCommand({ tabId: session.tabId }, 'Network.disable');
  } catch (error) {
    logger.warn('Failed to disable Network domain for HAR session cleanup', error);
  }

  try {
    await detachDebugger(session.tabId, 'export-har');
  } finally {
    clearExportHarSession(session.sessionId);
  }
}

export async function clearExpiredExportHarSession(
  session: ExportHarSession | undefined
): Promise<void> {
  if (session && isExportHarSessionExpired(session)) {
    await detachExportHarSession(session);
  }
}

export function handleExportHarForcedDetach(tabId: number): void {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) return;
  try {
    clearExportHarSessionForTab(tabId);
  } finally {
    releaseMutation();
  }
}

export async function handleExportHarNavigationStart(tabId: number): Promise<void> {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) return;
  try {
    const sessionId = getExportHarSessionIdForTab(tabId);
    if (!sessionId) return;
    const session = getExportHarSession(sessionId);
    if (!session) {
      clearExportHarSessionForTab(tabId);
      return;
    }
    await detachExportHarSession(session);
  } finally {
    releaseMutation();
  }
}
