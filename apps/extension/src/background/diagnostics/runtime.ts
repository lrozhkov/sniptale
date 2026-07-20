import { browserTabs } from '@sniptale/platform/browser/tabs';
import { sendTabMessage } from '../../platform/runtime-messaging/index';
import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { armDebuggerActivation } from '../debugger/session/activation';
import { attachDebugger } from '../debugger/session/attach';
import { detachDebugger } from '../debugger/session/detach';
import { hasAttachedClient } from '../debugger/session';
import { detachDebuggerForPrivacyErasure } from '../debugger/session/detach.privacy-erasure';
import { disableDiagnosticsDomainsForPrivacyErasure } from '../debugger/privacy-erasure';
import { disableDiagnosticsDomains, enableDiagnosticsDomains } from '../debugger/diagnostics';
import {
  getDiagnosticsSession,
  registerDiagnosticsSession,
  unregisterDiagnosticsSession,
} from './state';
import { diagnosticsLogger } from './logger';
import { restoreStoredDiagnosticsSession } from '../storage/diagnostics/active-sessions';

export async function resolveTabUrl(tabId: number): Promise<string> {
  try {
    const tab = await browserTabs.get(tabId);
    return tab.url || '';
  } catch (error) {
    diagnosticsLogger.error('Failed to resolve diagnostics tab URL', error);
    return '';
  }
}

export async function enableDiagnosticsForSession(
  tabId: number,
  recordingId: string
): Promise<void> {
  try {
    await attachDebugger(
      tabId,
      'diagnostics',
      armDebuggerActivation({ client: 'diagnostics', reason: 'diagnostics-session', tabId })
    );
    await enableDiagnosticsDomains(tabId);
    diagnosticsLogger.debug('Attached debugger for diagnostics session', {
      recordingId,
      tabId,
    });
  } catch (error) {
    diagnosticsLogger.error('Failed to attach debugger for diagnostics session', error);
    if (hasAttachedClient(tabId, 'diagnostics')) {
      try {
        await disableDiagnosticsDomainsForPrivacyErasure(tabId);
      } catch (cleanupError) {
        diagnosticsLogger.warn(
          'Failed to disable diagnostics domains after startup failure',
          cleanupError
        );
      }
      try {
        await detachDebuggerForPrivacyErasure(tabId, 'diagnostics');
      } catch (cleanupError) {
        diagnosticsLogger.warn(
          'Failed to detach diagnostics debugger after startup failure',
          cleanupError
        );
      }
    }
    unregisterDiagnosticsSession(recordingId, tabId);
    throw error;
  }
}

export async function notifyDiagnosticLogger(
  tabId: number,
  type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER | VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  recordingId?: string
): Promise<void> {
  try {
    await sendTabMessage(
      tabId,
      recordingId === undefined
        ? { type }
        : {
            type,
            recordingId,
          }
    );
  } catch (error) {
    diagnosticsLogger.warn('Failed to update content diagnostics logger state', {
      error,
      recordingId,
      tabId,
      type,
    });
  }
}

export async function restoreOrGetSession(
  recordingId: string
): Promise<ActiveDiagnosticsSession | null> {
  const activeSession = getDiagnosticsSession(recordingId);
  if (activeSession) {
    return activeSession;
  }

  const restoredSession = await restoreStoredDiagnosticsSession(recordingId);
  if (!restoredSession) {
    return null;
  }

  registerDiagnosticsSession(restoredSession);
  return restoredSession;
}

export async function shutDownDiagnosticsSession(session: ActiveDiagnosticsSession): Promise<void> {
  try {
    await disableDiagnosticsDomains(session.tabId);
    await detachDebugger(session.tabId, 'diagnostics');
  } catch (error) {
    diagnosticsLogger.warn('Failed to detach debugger for diagnostics session shutdown', error);
  }

  await notifyDiagnosticLogger(session.tabId, VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER);
}
