import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

export const SYNC_WORKSPACE_MARKER_KEY = '.sniptale/workspace.json';
export const SYNC_WORKSPACE_MARKER_MAX_BYTES = 4096;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

/** Identity of exact canonical workspace marker bytes. This grants no authorization. */
export interface SyncWorkspaceIdentity {
  spaceId: string;
  bootstrapId: string;
  fingerprint: string;
}

/** Fixed failures exclude untrusted marker contents. */
export class SyncWorkspaceMarkerError extends Error {
  constructor(readonly code: 'invalid-marker' | 'unsupported-format') {
    super(code);
    this.name = 'SyncWorkspaceMarkerError';
  }
}
function invalid(): never {
  throw new SyncWorkspaceMarkerError('invalid-marker');
}
function exact(value: Record<string, unknown>, fields: string[]): boolean {
  return (
    Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key))
  );
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}
function fingerprint(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/** Parse optional exact workspace binding; only null means no binding. */
export function parseSyncWorkspaceIdentity(value: unknown): SyncWorkspaceIdentity | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !exact(value, ['spaceId', 'bootstrapId', 'fingerprint']) ||
    !uuid(value['spaceId']) ||
    !uuid(value['bootstrapId']) ||
    typeof value['fingerprint'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['fingerprint'])
  )
    return invalid();
  return {
    spaceId: value['spaceId'],
    bootstrapId: value['bootstrapId'],
    fingerprint: value['fingerprint'],
  };
}

/** Produce the only supported six-field canonical UTF8 marker representation. */
export function encodeSyncWorkspaceMarker(
  spaceIdInput: unknown,
  bootstrapIdInput: unknown
): { text: string; identity: SyncWorkspaceIdentity } {
  if (!uuid(spaceIdInput) || !uuid(bootstrapIdInput)) return invalid();
  const text = JSON.stringify({
    format: 'sniptale-sync-workspace',
    version: 1,
    protocol: 'immutable-records-v1',
    protection: 'plaintext',
    spaceId: spaceIdInput,
    bootstrapId: bootstrapIdInput,
  });
  return {
    text,
    identity: {
      spaceId: spaceIdInput,
      bootstrapId: bootstrapIdInput,
      fingerprint: fingerprint(text),
    },
  };
}

/** Validate exact bounded canonical bytes before admitting a remote marker. */
export function parseSyncWorkspaceMarker(input: unknown): SyncWorkspaceIdentity {
  if (
    typeof input !== 'string' ||
    input.length > SYNC_WORKSPACE_MARKER_MAX_BYTES ||
    new TextEncoder().encode(input).byteLength > SYNC_WORKSPACE_MARKER_MAX_BYTES
  )
    return invalid();
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return invalid();
  }
  if (
    !isRecord(value) ||
    !exact(value, ['format', 'version', 'protocol', 'protection', 'spaceId', 'bootstrapId'])
  )
    return invalid();
  if (
    value['format'] !== 'sniptale-sync-workspace' ||
    value['version'] !== 1 ||
    value['protocol'] !== 'immutable-records-v1' ||
    value['protection'] !== 'plaintext'
  )
    throw new SyncWorkspaceMarkerError('unsupported-format');
  const encoded = encodeSyncWorkspaceMarker(value['spaceId'], value['bootstrapId']);
  if (encoded.text !== input) return invalid();
  return encoded.identity;
}
