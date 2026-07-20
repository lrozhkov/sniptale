import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeRecordingTracePayload(messageType: string, payload: unknown): unknown {
  if (messageType !== MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK || !isRecord(payload)) {
    return payload;
  }

  const { base64, ...metadata } = payload;
  return {
    ...metadata,
    base64: '[recording chunk omitted]',
    ...(isCanonicalBase64(base64)
      ? { base64DecodedBytes: estimateBase64DecodedBytes(base64) }
      : {}),
  };
}
