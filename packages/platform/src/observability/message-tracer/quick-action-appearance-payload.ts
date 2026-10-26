import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const QUICK_ACTION_APPEARANCE_TRACE_FAILURE_CODE = 'quick-action-appearance-runtime-failure';

export function isQuickActionAppearanceTraceMessageType(messageType: string): boolean {
  return (
    messageType === MessageType.OFFSCREEN_QUICK_ACTION_HEADER ||
    messageType === `${MessageType.OFFSCREEN_QUICK_ACTION_HEADER}_RESPONSE`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 32768;
}

export function sanitizeQuickActionAppearanceTracePayload(
  messageType: string,
  payload: unknown
): unknown {
  if (!isQuickActionAppearanceTraceMessageType(messageType)) return payload;
  const summary: Record<string, unknown> = { type: MessageType.OFFSCREEN_QUICK_ACTION_HEADER };
  if (!isRecord(payload)) return summary;
  if (typeof payload['success'] === 'boolean') summary['success'] = payload['success'];
  const source = payload['source'];
  if (isRecord(source) && isDimension(source['width']) && isDimension(source['height'])) {
    summary['source'] = { width: source['width'], height: source['height'] };
  }
  return summary;
}
