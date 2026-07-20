import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import {
  startConsoleDiagnosticsCapture,
  stopConsoleDiagnosticsCapture,
} from '../diagnostics/console';

export function shouldCaptureConsoleDiagnostics(options: ExportOptions): boolean {
  return options.includeBasicLogs || options.includeHarDomLogs || options.includeCssDiagnostics;
}

export async function runWithConsoleDiagnosticsSession<T>(
  enabled: boolean,
  run: () => Promise<T>
): Promise<T> {
  if (!enabled) {
    return run();
  }

  startConsoleDiagnosticsCapture();
  try {
    return await run();
  } finally {
    stopConsoleDiagnosticsCapture();
  }
}
