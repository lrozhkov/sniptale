import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { installDiagnosticLogObserver } from '@sniptale/platform/observability/logger';
import { DIAGNOSTIC_LOG_PORT, type DiagnosticPortEvent } from '../../contracts/diagnostics';

/** A lazy bounded content/offscreen channel; no page-origin storage, polling or reconnect timer. */
export function createDiagnosticPortWriter() {
  let port: chrome.runtime.Port | null = null;
  let windowStart = 0;
  let sent = 0;
  let dropped = 0;
  const disconnected = () => {
    browserRuntime.getLastError();
    port?.onDisconnect.removeListener(disconnected);
    port = null;
  };
  function send(event: DiagnosticPortEvent): boolean {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      sent = 0;
    }
    if (sent >= 64) {
      dropped = Math.min(1_000_000_000, dropped + 1);
      return false;
    }
    try {
      if (!port) {
        port = browserRuntime.connect({ name: DIAGNOSTIC_LOG_PORT });
        port.onDisconnect.addListener(disconnected);
      }
      if (dropped && sent < 63) {
        port.postMessage({
          time: new Date(now).toISOString(),
          source: 'RuntimeDiagnostics',
          level: 'warn',
          message: `Dropped diagnostic summaries: ${dropped}`,
        });
        dropped = 0;
        sent++;
      }
      port.postMessage(event);
      sent++;
      return true;
    } catch {
      port?.onDisconnect.removeListener(disconnected);
      try {
        port?.disconnect();
      } catch {
        /* Invalid extension context. */
      }
      port = null;
      sent = 64;
      return false;
    }
  }
  function dispose() {
    port?.onDisconnect.removeListener(disconnected);
    try {
      port?.disconnect();
    } catch {
      /* Already disconnected. */
    }
    port = null;
  }
  return { send, dispose };
}

/** Installs logger observation using the same bounded writer as structured maintenance. */
export function installDiagnosticPortCapture(): () => void {
  const writer = createDiagnosticPortWriter();
  const dispose = installDiagnosticLogObserver((event) => {
    writer.send(event);
  });
  return () => {
    dispose();
    writer.dispose();
  };
}
