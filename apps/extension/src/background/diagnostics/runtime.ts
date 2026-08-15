import { browserTabs } from '@sniptale/platform/browser/tabs';
import { sendTabMessage } from '../../platform/runtime-messaging/index';
import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getDiagnosticsSession, registerDiagnosticsSession } from './state';
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
  await notifyDiagnosticLogger(session.tabId, VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER);
}
