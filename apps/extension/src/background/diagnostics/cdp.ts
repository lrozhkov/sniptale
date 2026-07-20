import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { getTabIdByTargetId } from '../debugger/session';
import { dispatchDebuggerEvent } from './cdp.dispatch';
import { appendForcedDetachEvent, appendNavigationEvent } from './cdp.event-appenders';
import { diagnosticsLogger } from './logger';
import type { MaybeFlush } from './cdp.types';

export function processDebuggerEvent(args: {
  source: chrome.debugger.Debuggee;
  method: string;
  params: unknown;
  resolveRecordingId: (tabId: number) => string | undefined;
  getSession: (recordingId: string) => ActiveDiagnosticsSession | undefined;
  maybeFlush: MaybeFlush;
}): void {
  let tabId = args.source.tabId;

  if (!tabId && args.source.targetId) {
    tabId = getTabIdByTargetId(args.source.targetId);
  }

  if (!tabId) {
    if (args.method.startsWith('Runtime.') || args.method.startsWith('Network.')) {
      diagnosticsLogger.debug('Ignoring debugger event without tab context', {
        hasTargetId: Boolean(args.source.targetId),
        method: args.method,
      });
    }
    return;
  }

  const recordingId = args.resolveRecordingId(tabId);
  if (!recordingId) {
    return;
  }

  const session = args.getSession(recordingId);
  if (!session || session.isPaused) {
    return;
  }

  const tsMs = performance.now() - session.startedAt;

  try {
    dispatchDebuggerEvent({
      method: args.method,
      session,
      tsMs,
      params: args.params,
      maybeFlush: args.maybeFlush,
    });
  } catch (error) {
    diagnosticsLogger.error('Error handling debugger event', error);
  }
}

export { appendForcedDetachEvent, appendNavigationEvent };
