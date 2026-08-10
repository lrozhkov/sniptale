export type CaptureDeliveryPayload =
  | string
  | { assetId?: string | undefined; dataUrl: string; jobId?: string | undefined };

export function readCaptureDeliveryPayload(payload: CaptureDeliveryPayload): {
  assetId?: string | undefined;
  dataUrl: string;
  jobId?: string | undefined;
} {
  return typeof payload === 'string' ? { dataUrl: payload } : payload;
}
