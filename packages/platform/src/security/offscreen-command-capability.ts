import {
  createCapabilityContext,
  isCapabilityContextAuthorized,
  type CapabilityContext,
} from './capability-context';
import { RUNTIME_MESSAGE_FRESHNESS_FIELD } from '@sniptale/runtime-contracts/protocol/runtime-message-freshness';

const OFFSCREEN_COMMAND_CAPABILITY_PREFIX = 'sniptale-offscreen-command.v1.';
const OFFSCREEN_COMMAND_CAPABILITY_SCOPE = 'offscreen:command';
const OFFSCREEN_COMMAND_CAPABILITY_ORIGIN = 'sniptale:offscreen-command';
const OFFSCREEN_COMMAND_CAPABILITY_TTL_MS = 2 * 60 * 1000;

type OffscreenCommandCapabilityPayload = {
  binding: string;
  capabilityContext: CapabilityContext;
  expiresAtEpochMs: number;
  generation: string;
  token: string;
  type: string;
  version: 1;
};

type OffscreenCommandCapabilityAuthorization =
  | { authorized: true; generation: string }
  | { authorized: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createTokenPart(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Offscreen command capability token generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createStableJsonHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createBindingPayload(message: Record<string, unknown>): Record<string, unknown> {
  const {
    capabilityToken: _capabilityToken,
    [RUNTIME_MESSAGE_FRESHNESS_FIELD]: _freshness,
    ...bindingPayload
  } = message;
  return bindingPayload;
}

export function createOffscreenCommandBinding(message: Record<string, unknown>): string {
  return createStableJsonHash(stableJson(createBindingPayload(message)));
}

function encodeCapabilityPayload(payload: OffscreenCommandCapabilityPayload): string {
  return `${OFFSCREEN_COMMAND_CAPABILITY_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function parseCapabilityContext(value: unknown): CapabilityContext | null {
  if (
    !isRecord(value) ||
    typeof value['expiresAtEpochMs'] !== 'number' ||
    (value['origin'] !== null && typeof value['origin'] !== 'string') ||
    !Array.isArray(value['scopes']) ||
    (value['tabId'] !== null && typeof value['tabId'] !== 'number') ||
    typeof value['token'] !== 'string'
  ) {
    return null;
  }

  const scopes = value['scopes'];
  if (
    !scopes.every(
      (scope): scope is CapabilityContext['scopes'][number] =>
        scope === OFFSCREEN_COMMAND_CAPABILITY_SCOPE
    )
  ) {
    return null;
  }

  return {
    expiresAtEpochMs: value['expiresAtEpochMs'],
    origin: value['origin'],
    scopes,
    tabId: value['tabId'],
    token: value['token'],
  };
}

function parseCapabilityPayload(value: string): OffscreenCommandCapabilityPayload | null {
  if (!value.startsWith(OFFSCREEN_COMMAND_CAPABILITY_PREFIX)) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(
      decodeURIComponent(value.slice(OFFSCREEN_COMMAND_CAPABILITY_PREFIX.length))
    );
    const capabilityContext = isRecord(decoded)
      ? parseCapabilityContext(decoded['capabilityContext'])
      : null;
    if (
      !isRecord(decoded) ||
      decoded['version'] !== 1 ||
      typeof decoded['binding'] !== 'string' ||
      typeof decoded['expiresAtEpochMs'] !== 'number' ||
      typeof decoded['generation'] !== 'string' ||
      typeof decoded['token'] !== 'string' ||
      typeof decoded['type'] !== 'string' ||
      !capabilityContext
    ) {
      return null;
    }

    return {
      binding: decoded['binding'],
      capabilityContext,
      expiresAtEpochMs: decoded['expiresAtEpochMs'],
      generation: decoded['generation'],
      token: decoded['token'],
      type: decoded['type'],
      version: 1,
    };
  } catch {
    return null;
  }
}

export function attachOffscreenCommandCapability<TMessage extends { type: string }>(
  message: TMessage,
  nowEpochMs = Date.now()
): TMessage & { capabilityToken: string } {
  const token = createTokenPart();
  const expiresAtEpochMs = nowEpochMs + OFFSCREEN_COMMAND_CAPABILITY_TTL_MS;
  const messageRecord = message as Record<string, unknown>;

  return {
    ...message,
    capabilityToken: encodeCapabilityPayload({
      binding: createOffscreenCommandBinding(messageRecord),
      capabilityContext: createCapabilityContext({
        expiresAtEpochMs,
        origin: OFFSCREEN_COMMAND_CAPABILITY_ORIGIN,
        scopes: [OFFSCREEN_COMMAND_CAPABILITY_SCOPE],
        token,
      }),
      expiresAtEpochMs,
      generation: createTokenPart(),
      token,
      type: message.type,
      version: 1,
    }),
  };
}

export function authorizeOffscreenCommandCapability(
  message: Record<string, unknown>,
  nowEpochMs = Date.now()
): OffscreenCommandCapabilityAuthorization {
  const token = message['capabilityToken'];
  if (typeof token !== 'string' || token.length === 0) {
    return { authorized: false, reason: 'Missing offscreen command capability' };
  }

  const payload = parseCapabilityPayload(token);
  if (!payload || payload.expiresAtEpochMs <= nowEpochMs) {
    return { authorized: false, reason: 'Invalid offscreen command capability' };
  }

  if (
    payload.type !== message['type'] ||
    payload.binding !== createOffscreenCommandBinding(message)
  ) {
    return { authorized: false, reason: 'Offscreen command capability binding mismatch' };
  }

  return isCapabilityContextAuthorized(payload.capabilityContext, {
    origin: OFFSCREEN_COMMAND_CAPABILITY_ORIGIN,
    nowEpochMs,
    scope: OFFSCREEN_COMMAND_CAPABILITY_SCOPE,
    token: payload.token,
  })
    ? { authorized: true, generation: payload.generation }
    : { authorized: false, reason: 'Unauthorized offscreen command capability' };
}
