import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createMaintenanceLog } from '../../../composition/persistence/library-lifecycle/maintenance-log';
import { parseMaintenanceLogInput } from '../../../composition/persistence/library-lifecycle/maintenance-log-model';
import { resolveExtensionDocumentSenderUrl } from '../../../platform/runtime-messaging/document-sender';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { DIAGNOSTIC_LOG_PORT, parseDiagnosticLogEvent } from '../../../contracts/diagnostics';
import { createRuntimeLog } from '../../../composition/persistence/diagnostics/runtime-log';

/** Internal content/offscreen diagnostics have no read or action authority and bounded ingress resources. */
export function registerDiagnosticLogPorts(): () => void {
  const log = createRuntimeLog();
  const maintenance = createMaintenanceLog();
  const active = new Set<() => void>();
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
      if (!submission || (submission.kind === 'maintenance' && context !== 'offscreen')) {
        close();
        return;
      }
      if (submission.kind === 'maintenance') void maintenance.append(submission.input);
      else log.append(submission.event, context);
    };
    const timeout = setTimeout(close, 3000);
    active.add(close);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(close);
  });
  return () => {
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
  if (isRecord(raw) && raw['kind'] === 'maintenance') {
    const input = parseMaintenanceLogInput(raw['input']);
    return input ? { kind: 'maintenance' as const, input } : null;
  }
  const event = parseDiagnosticLogEvent(raw);
  return event ? { kind: 'runtime' as const, event } : null;
}
