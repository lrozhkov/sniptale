import {
  SYNC_WORKSPACE_MARKER_KEY as MARKER_KEY,
  SYNC_WORKSPACE_MARKER_MAX_BYTES as MAX_MARKER_BYTES,
  parseSyncWorkspaceIdentity,
  parseSyncWorkspaceMarker,
  SyncWorkspaceMarkerError,
  type SyncWorkspaceIdentity,
} from '../../contracts/sync-workspace';
import { scanSyncCatalog, SyncCatalogError } from './catalog';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
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
    try {
      return parseSyncWorkspaceMarker(text);
    } catch (error) {
      if (error instanceof SyncWorkspaceMarkerError) throw new SyncWorkspaceError(error.code);
      throw error;
    }
  } catch (error) {
    if (error instanceof SyncRemoteError && error.code === 'missing')
      throw new SyncWorkspaceError('marker-missing');
    throw error;
  }
}

/**
 * Check one exact marker binding with bounded reads and no catalog, media or write effects.
 * The caller owns endpoint authorization. This observation grants no execution authority.
 */
export async function verifySyncWorkspaceIdentity(
  remote: SyncRemoteStore,
  expectedInput: unknown,
  signal: AbortSignal
): Promise<SyncWorkspaceIdentity> {
  let expected;
  try {
    expected = parseSyncWorkspaceIdentity(expectedInput);
    if (!expected) throw new SyncWorkspaceError('invalid-binding');
  } catch {
    throw new SyncWorkspaceError('invalid-binding');
  }
  try {
    signal.throwIfAborted();
    const identity = await readMarker(remote, signal);
    signal.throwIfAborted();
    if (
      expected.spaceId !== identity.spaceId ||
      expected.bootstrapId !== identity.bootstrapId ||
      expected.fingerprint !== identity.fingerprint
    )
      throw new SyncWorkspaceError('binding-mismatch');
    return identity;
  } catch (error) {
    if (signal.aborted) throw new SyncWorkspaceError('cancelled');
    if (error instanceof SyncWorkspaceError || error instanceof SyncRemoteError) throw error;
    throw new SyncWorkspaceError('unavailable');
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
  let expected;
  try {
    expected = parseSyncWorkspaceIdentity(expectedInput);
  } catch {
    throw new SyncWorkspaceError('invalid-binding');
  }
  try {
    signal.throwIfAborted();
    const identity = expected
      ? await verifySyncWorkspaceIdentity(remote, expected, signal)
      : await readMarker(remote, signal);
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
