export type CaptureDeliveryPayload = string | { dataUrl: string; jobId?: string | undefined };

export function readCaptureDeliveryPayload(payload: CaptureDeliveryPayload): {
  dataUrl: string;
  jobId?: string | undefined;
} {
  return typeof payload === 'string' ? { dataUrl: payload } : payload;
}
