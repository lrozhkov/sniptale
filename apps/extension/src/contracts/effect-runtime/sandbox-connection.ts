import { hasExactKeys, isRecord } from './identity';
import {
  EFFECT_RUNTIME_SANDBOX_CONNECTION_FRAGMENT_KEY,
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
} from './types';

const CONNECTION_NONCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function createEffectRuntimeSandboxConnectionNonce(): string {
  return crypto.randomUUID();
}

export function createEffectRuntimeSandboxUrl(baseUrl: string, connectionNonce: string): string {
  if (!isEffectRuntimeSandboxConnectionNonce(connectionNonce)) fail();
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({
    [EFFECT_RUNTIME_SANDBOX_CONNECTION_FRAGMENT_KEY]: connectionNonce,
  }).toString();
  return url.href;
}

export function readEffectRuntimeSandboxConnectionNonce(hash: string): string | null {
  const fields = [...new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)];
  if (fields.length !== 1 || fields[0]?.[0] !== EFFECT_RUNTIME_SANDBOX_CONNECTION_FRAGMENT_KEY) {
    return null;
  }
  const nonce = fields[0][1];
  return isEffectRuntimeSandboxConnectionNonce(nonce) ? nonce : null;
}

export function isEffectRuntimeSandboxReady(value: unknown, connectionNonce: string): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['connectionNonce', 'type']) &&
    value['connectionNonce'] === connectionNonce &&
    value['type'] === EFFECT_RUNTIME_SANDBOX_READY_MESSAGE
  );
}

export function isEffectRuntimeSandboxConnectionNonce(value: unknown): value is string {
  return typeof value === 'string' && CONNECTION_NONCE_PATTERN.test(value);
}

function fail(): never {
  throw new Error('EFFECT_RUNTIME_SANDBOX_CONNECTION_INVALID');
}
