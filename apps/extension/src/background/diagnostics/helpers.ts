import type {
  DiagnosticEvent,
  DiagnosticEventFromCS,
} from '@sniptale/platform/observability/diagnostics/types';
import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

type CreateContentScriptDiagnosticEventParams = {
  createId?: () => string;
  message: DiagnosticEventFromCS;
  nowMs: number;
  recordingId: string;
  startedAt: number;
};

export function createContentScriptDiagnosticEvent({
  createId = () => crypto.randomUUID(),
  message,
  nowMs,
  recordingId,
  startedAt,
}: CreateContentScriptDiagnosticEventParams): DiagnosticEvent {
  return {
    id: createId(),
    recordingId,
    tsMs: message.tsMs ?? nowMs - startedAt,
    kind: message.kind,
    message: sanitizeDiagnosticMessage(message.message),
    ...(message.level === undefined ? {} : { level: message.level }),
    ...(message.data === undefined ? {} : { data: sanitizeDiagnosticData(message.data) }),
  };
}
