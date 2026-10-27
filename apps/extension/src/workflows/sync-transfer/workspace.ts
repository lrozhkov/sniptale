import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseBoundedJson } from '../media-hub-backup/v6/codec';
import { scanSyncCatalog, SyncCatalogError } from './catalog';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { hashSyncText } from './wire-record';

const MARKER_KEY = '.sniptale/workspace.json';
const MAX_MARKER_BYTES = 4096;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

interface WorkspaceIdentity {
  spaceId: string;
  bootstrapId: string;
  fingerprint: string;
}

/** Fixed failures exclude provider messages, remote content, paths and credentials. */
export class SyncWorkspaceError extends Error {
  constructor(
    readonly code:
      | 'invalid-binding'
      | 'marker-missing'
      | 'invalid-marker'
      | 'unsupported-format'
      | 'binding-mismatch'
      | 'workspace-changed'
      | 'metadata-limit'
      | 'cancelled'
      | 'unavailable'
  ) {
    super(code);
    this.name = 'SyncWorkspaceError';
  }
}

function exactFields(value: Record<string, unknown>, fields: string[]) {
  return Object.keys(value).length === fields.length && fields.every((field) => field in value);
}

function parseExpectedIdentity(value: unknown): WorkspaceIdentity | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !exactFields(value, ['spaceId', 'bootstrapId', 'fingerprint']) ||
    typeof value['spaceId'] !== 'string' ||
    !UUID_V4.test(value['spaceId']) ||
    typeof value['bootstrapId'] !== 'string' ||
    !UUID_V4.test(value['bootstrapId']) ||
    typeof value['fingerprint'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['fingerprint'])
  )
    throw new SyncWorkspaceError('invalid-binding');
  return {
    spaceId: value['spaceId'],
    bootstrapId: value['bootstrapId'],
    fingerprint: value['fingerprint'],
  };
}

function parseMarker(text: string): WorkspaceIdentity {
  let value: unknown;
  try {
    value = parseBoundedJson(text, MAX_MARKER_BYTES);
  } catch {
    throw new SyncWorkspaceError('invalid-marker');
  }
  if (
    !isRecord(value) ||
    !exactFields(value, ['format', 'version', 'protocol', 'protection', 'spaceId', 'bootstrapId'])
  )
    throw new SyncWorkspaceError('invalid-marker');
  if (
    value['format'] !== 'sniptale-sync-workspace' ||
    value['version'] !== 1 ||
    value['protocol'] !== 'immutable-records-v1' ||
    value['protection'] !== 'plaintext'
  )
    throw new SyncWorkspaceError('unsupported-format');
  if (
    typeof value['spaceId'] !== 'string' ||
    !UUID_V4.test(value['spaceId']) ||
    typeof value['bootstrapId'] !== 'string' ||
    !UUID_V4.test(value['bootstrapId'])
  )
    throw new SyncWorkspaceError('invalid-marker');
  const marker = {
    format: 'sniptale-sync-workspace',
    version: 1,
    protocol: 'immutable-records-v1',
    protection: 'plaintext',
    spaceId: value['spaceId'],
    bootstrapId: value['bootstrapId'],
  };
  if (JSON.stringify(marker) !== text) throw new SyncWorkspaceError('invalid-marker');
  return {
    spaceId: marker.spaceId,
    bootstrapId: marker.bootstrapId,
    fingerprint: hashSyncText(text),
  };
}

async function readMarker(remote: SyncRemoteStore, signal: AbortSignal) {
  try {
    const { size } = await remote.stat(MARKER_KEY, signal);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(size) || size < 0) throw new SyncWorkspaceError('invalid-marker');
    if (size > MAX_MARKER_BYTES) throw new SyncWorkspaceError('metadata-limit');
    const stream = await remote.read(MARKER_KEY, signal);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    await stream.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          bytes += chunk.byteLength;
          if (bytes > MAX_MARKER_BYTES) throw new SyncWorkspaceError('metadata-limit');
          if (bytes > size) throw new SyncWorkspaceError('invalid-marker');
          chunks.push(new Uint8Array(chunk));
        },
      }),
      { signal }
    );
    if (bytes !== size) throw new SyncWorkspaceError('invalid-marker');
    const payload = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload);
    } catch {
      throw new SyncWorkspaceError('invalid-marker');
    }
    return parseMarker(text);
  } catch (error) {
    if (error instanceof SyncRemoteError && error.code === 'missing')
      throw new SyncWorkspaceError('marker-missing');
    throw error;
  }
}

/**
 * Inspect one exact workspace root without writes, enrollment or media reads.
 * The immutable marker commits even an empty workspace; it replaces no mutable HEAD.
 * The caller owns endpoint authorization. This snapshot grants no execution authority.
 * A second read detects observed identity changes, not hostile rollback or later changes.
 */
export async function prepareSyncWorkspaceJoin(
  remote: SyncRemoteStore,
  signal: AbortSignal,
  expectedInput: unknown = null
) {
  const expected = parseExpectedIdentity(expectedInput);
  try {
    signal.throwIfAborted();
    const identity = await readMarker(remote, signal);
    if (
      expected &&
      (expected.spaceId !== identity.spaceId ||
        expected.bootstrapId !== identity.bootstrapId ||
        expected.fingerprint !== identity.fingerprint)
    )
      throw new SyncWorkspaceError('binding-mismatch');
    const catalog = await scanSyncCatalog(remote, identity.spaceId, signal);
    const confirmed = await readMarker(remote, signal);
    signal.throwIfAborted();
    if (confirmed.fingerprint !== identity.fingerprint)
      throw new SyncWorkspaceError('workspace-changed');
    return { identity, catalog };
  } catch (error) {
    if (signal.aborted) throw new SyncWorkspaceError('cancelled');
    if (
      error instanceof SyncWorkspaceError ||
      error instanceof SyncRemoteError ||
      error instanceof SyncCatalogError
    )
      throw error;
    throw new SyncWorkspaceError('unavailable');
  }
}
