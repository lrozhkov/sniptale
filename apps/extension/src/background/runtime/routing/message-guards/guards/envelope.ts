import type { RuntimeMessageEnvelope } from './shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRuntimeMessageEnvelope(message: unknown): message is RuntimeMessageEnvelope {
  if (!isRecord(message)) {
    return false;
  }

  return (
    typeof message['type'] === 'string' &&
    (message['tabId'] === undefined || typeof message['tabId'] === 'number')
  );
}
