const RUNTIME_MESSAGE_BLOB_ENVELOPE = '__sniptaleRuntimeBlob';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeMessageBlobEnvelope(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value[RUNTIME_MESSAGE_BLOB_ENVELOPE] === true &&
    typeof value['base64'] === 'string' &&
    typeof value['mimeType'] === 'string' &&
    typeof value['size'] === 'number'
  );
}

export function sanitizeRuntimeBlobTracePayload(payload: unknown): unknown {
  if (isRuntimeMessageBlobEnvelope(payload)) {
    const { base64: _base64, ...metadata } = payload;
    return {
      ...metadata,
      base64: '[runtime blob omitted]',
    };
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizeRuntimeBlobTracePayload);
  }
  if (!isRecord(payload)) {
    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, sanitizeRuntimeBlobTracePayload(value)])
  );
}
