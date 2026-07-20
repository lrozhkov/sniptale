/**
 * Canonical runtime/tab message response envelope.
 * Success responses may carry typed payload fields; failure responses stay compatible
 * with the legacy `{ success?: false, error?: string }` contract.
 */
type RuntimeMessageSuccess<TPayload extends object = Record<string, never>> = {
  success: true;
  error?: undefined;
} & TPayload;

/**
 * Failure branch for runtime/tab messaging.
 * Payload fields remain optional so legacy handlers can still attach partial data.
 */
type RuntimeMessageFailure<TPayload extends object = Record<string, never>> = {
  success?: false;
  error?: string;
} & Partial<TPayload>;

/**
 * Unified response shape used by typed runtime/tab messaging helpers.
 */
export type RuntimeMessageResponse<TPayload extends object = Record<string, never>> =
  | RuntimeMessageSuccess<TPayload>
  | RuntimeMessageFailure<TPayload>;

/**
 * Ack-style response for fire-and-forget flows where listeners may omit `sendResponse`.
 */
export type RuntimeAckResponse = RuntimeMessageResponse<{ result?: string }> | undefined;
