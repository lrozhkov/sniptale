export const RUNTIME_MESSAGE_FRESHNESS_FIELD = '__sniptaleRuntimeFreshness';

export type RuntimeMessageFreshness = {
  issuedAtEpochMs: number;
  nonce: string;
};

type RuntimeMessageFreshnessSplit =
  | {
      freshness: RuntimeMessageFreshness;
      message: Record<string, unknown>;
      valid: true;
    }
  | {
      message: unknown;
      reason: string;
      valid: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRuntimeMessageFreshness(value: unknown): RuntimeMessageFreshness | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value['nonce'] !== 'string' || value['nonce'].length === 0) {
    return null;
  }
  if (typeof value['issuedAtEpochMs'] !== 'number' || !Number.isFinite(value['issuedAtEpochMs'])) {
    return null;
  }
  return {
    issuedAtEpochMs: value['issuedAtEpochMs'],
    nonce: value['nonce'],
  };
}

export function splitRuntimeMessageFreshness(input: unknown): RuntimeMessageFreshnessSplit {
  if (!isRecord(input)) {
    return { message: input, reason: 'Runtime message payload must be an object', valid: false };
  }

  const freshness = parseRuntimeMessageFreshness(input[RUNTIME_MESSAGE_FRESHNESS_FIELD]);
  if (!freshness) {
    return { message: input, reason: 'Missing or invalid runtime message freshness', valid: false };
  }

  const { [RUNTIME_MESSAGE_FRESHNESS_FIELD]: _freshness, ...message } = input;
  return { freshness, message, valid: true };
}

export function stripRuntimeMessageFreshness(input: unknown): unknown {
  if (!isRecord(input) || !(RUNTIME_MESSAGE_FRESHNESS_FIELD in input)) {
    return input;
  }

  const { [RUNTIME_MESSAGE_FRESHNESS_FIELD]: _freshness, ...message } = input;
  return message;
}
