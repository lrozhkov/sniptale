import {
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
  stringifyDiagnosticValue,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

type DiagnosticCallFrame = {
  functionName: string;
  lineNumber: number;
  url: string;
};

type DiagnosticConsoleArg = {
  description?: string;
  value?: unknown;
};

export function sanitizeStackTraceFrames(frames: DiagnosticCallFrame[] | undefined, limit: number) {
  return frames?.slice(0, limit).map((frame) => ({
    functionName: sanitizeDiagnosticMessage(frame.functionName || '<anonymous>'),
    url: sanitizeDiagnosticUrl(frame.url) ?? '',
    lineNumber: frame.lineNumber,
  }));
}

export function buildConsoleEventMessage(args: DiagnosticConsoleArg[]): string {
  return sanitizeDiagnosticMessage(
    args.map((arg) => stringifyDiagnosticValue(arg.value ?? arg.description ?? '')).join(' ')
  );
}
