import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createMaintenanceLog } from '../../../composition/persistence/library-lifecycle/maintenance-log';
import { parseMaintenanceLogInput } from '../../../composition/persistence/library-lifecycle/maintenance-log-model';
import { resolveExtensionDocumentSenderUrl } from '../../../platform/runtime-messaging/document-sender';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  DIAGNOSTIC_LOG_PORT,
  parseDiagnosticLogEvent,
  parseSyncQueueDiagnosticHint,
} from '../../../contracts/diagnostics';
import { createRuntimeLog } from '../../../composition/persistence/diagnostics/runtime-log';
import { deliverSyncQueueHistory } from '../../../workflows/sync-transfer/queue-history';
import { registerQueueHistoryCatchup } from './history-catchup';

/** Bounded diagnostic ingress. Source hints confer no transfer or source-release authority. */
export function registerDiagnosticLogPorts(): () => void {
  const log = createRuntimeLog();
  const maintenance = createMaintenanceLog();
  const catchup = registerQueueHistoryCatchup();
  const active = new Set<() => void>();
  const pendingHistory = new Set<string>();
  const unsubscribe = browserRuntime.subscribeToConnections((port) => {
    if (port.name !== DIAGNOSTIC_LOG_PORT) return;
    const context = resolveDiagnosticContext(port.sender);
    if (!context || active.size >= 16) {
      port.disconnect();
      return;
    }
    let count = 0;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      active.delete(close);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(close);
      try {
        port.disconnect();
      } catch {
        /* Already disconnected. */
      }
    };
    const onMessage = (raw: unknown) => {
      if (closed) return;
      if (++count > 64) {
        close();
        return;
      }
      const submission = parseDiagnosticSubmission(raw);
      if (!submission || (submission.kind !== 'runtime' && context !== 'offscreen')) {
        close();
        return;
      }
      if (submission.kind === 'sync-queue') {
        const key = JSON.stringify(submission.input);
        if (pendingHistory.has(key) || pendingHistory.size >= 4) return;
        pendingHistory.add(key);
        void deliverSyncQueueHistory(submission.input.scope, submission.input.source)
          .catch(() => false)
          .finally(() => pendingHistory.delete(key));
      } else if (submission.kind === 'maintenance') void maintenance.append(submission.input);
      else log.append(submission.event, context);
    };
    const timeout = setTimeout(close, 3000);
    active.add(close);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(close);
  });
  void catchup.run();
  return () => {
    catchup.dispose();
    unsubscribe();
    for (const close of active) close();
  };
}

function resolveDiagnosticContext(
  sender: chrome.runtime.MessageSender | undefined
): 'content' | 'offscreen' | null {
  let context: 'content' | 'offscreen' | null = null;
  try {
    const content =
      sender?.id === new URL(browserRuntime.getURL('')).host &&
      typeof sender?.tab?.id === 'number' &&
      typeof sender.frameId === 'number' &&
      sender.frameId >= 0 &&
      typeof sender.documentId === 'string' &&
      sender.documentId.length > 0 &&
      typeof sender.url === 'string' &&
      ['http:', 'https:', 'file:', 'about:'].includes(new URL(sender.url).protocol);
    if (content) context = 'content';
    else if (
      sender?.id === new URL(browserRuntime.getURL('')).host &&
      !sender.tab &&
      typeof sender.documentId === 'string' &&
      sender.documentId.length > 0 &&
      resolveExtensionDocumentSenderUrl(sender, 'apps/extension/src/offscreen/offscreen.html')
    )
      context = 'offscreen';
  } catch {
    /* Invalid sender metadata cannot write diagnostics. */
  }
  return context;
}

function parseDiagnosticSubmission(raw: unknown) {
  if (isRecord(raw) && raw['kind'] === 'sync-queue') {
    const input = parseSyncQueueDiagnosticHint(raw['input']);
    return input ? { kind: 'sync-queue' as const, input } : null;
  }
  if (isRecord(raw) && raw['kind'] === 'maintenance') {
    const input = parseMaintenanceLogInput(raw['input']);
    return input ? { kind: 'maintenance' as const, input } : null;
  }
  const event = parseDiagnosticLogEvent(raw);
  return event ? { kind: 'runtime' as const, event } : null;
}
