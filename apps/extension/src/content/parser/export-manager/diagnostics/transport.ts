import { getContentRuntimeServices } from '../../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  sanitizeDiagnosticExportData,
  sanitizeDiagnosticMessage,
  sanitizeRawDiagnosticExportData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

export type ExportHarCaptureResult = {
  har: Record<string, unknown>;
  rawDiagnosticsEnabled: boolean;
};

export type ExportHarCaptureHandle = {
  capabilityToken: string;
  expiresAtEpochMs: number;
  sessionId: string;
};

type StartExportHarCaptureOptions = {
  rawDiagnosticsEnabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectToRecord(value: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry;
  }
  return record;
}

function parseHarDiagnosticPayload(
  payload: unknown,
  rawDiagnosticsEnabled: boolean
): Record<string, unknown> | null {
  if (payload === undefined || payload === null) {
    return null;
  }

  const diagnosticPayload = rawDiagnosticsEnabled
    ? sanitizeRawDiagnosticExportData(payload)
    : sanitizeDiagnosticExportData(payload);
  if (!isRecord(diagnosticPayload)) {
    throw new Error('Failed to stop HAR collection.');
  }

  return objectToRecord(diagnosticPayload);
}

function parseRawDiagnosticsEnabled(value: unknown): boolean {
  return value === true;
}

/**
 * Start true HAR collection in background for the current export request.
 */
export async function startExportHarCapture(
  sessionId: string,
  options: StartExportHarCaptureOptions = {}
): Promise<ExportHarCaptureHandle> {
  const sanitizedSessionId = sanitizeDiagnosticMessage(sessionId);
  const capabilityResponse = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    ...(options.rawDiagnosticsEnabled === true ? { rawDiagnosticsEnabled: true } : {}),
    sessionId: sanitizedSessionId,
    type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
  });
  if (!capabilityResponse.success || typeof capabilityResponse.capabilityToken !== 'string') {
    throw new Error(capabilityResponse.error || 'Failed to authorize HAR collection.');
  }
  const startCapabilityToken = sanitizeDiagnosticMessage(capabilityResponse.capabilityToken);

  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    capabilityToken: startCapabilityToken,
    sessionId: sanitizedSessionId,
    type: MessageType.EXPORT_START_HAR,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to start HAR collection.');
  }

  if (
    typeof response.capabilityToken !== 'string' ||
    typeof response.expiresAtEpochMs !== 'number'
  ) {
    throw new Error('Failed to start HAR collection.');
  }

  return {
    capabilityToken: response.capabilityToken,
    expiresAtEpochMs: response.expiresAtEpochMs,
    sessionId: sanitizedSessionId,
  };
}

/**
 * Stop true HAR collection and return the resulting HAR payload.
 */
export async function stopExportHarCapture(
  handle: ExportHarCaptureHandle
): Promise<ExportHarCaptureResult | null> {
  const sanitizedSessionId = sanitizeDiagnosticMessage(handle.sessionId);
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    capabilityToken: handle.capabilityToken,
    sessionId: sanitizedSessionId,
    type: MessageType.EXPORT_STOP_HAR,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to stop HAR collection.');
  }

  const rawDiagnosticsEnabled = parseRawDiagnosticsEnabled(response.rawDiagnosticsEnabled);
  const har = parseHarDiagnosticPayload(response.har, rawDiagnosticsEnabled);
  return har
    ? {
        har,
        rawDiagnosticsEnabled,
      }
    : null;
}
