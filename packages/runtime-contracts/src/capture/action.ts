const CAPTURE_ACTION_TYPES = [
  'download_default',
  'ask_preset',
  'ask_system',
  'scenario',
  'edit',
  'copy',
] as const;

export type CaptureActionType = (typeof CAPTURE_ACTION_TYPES)[number];

const captureActionTypeValues = new Set<string>(CAPTURE_ACTION_TYPES);

export function isCaptureActionTypeValue(value: unknown): value is CaptureActionType {
  return typeof value === 'string' && captureActionTypeValues.has(value);
}
