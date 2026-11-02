import {
  SYNC_WORKSPACE_MARKER_KEY as MARKER_KEY,
  SYNC_WORKSPACE_MARKER_MAX_BYTES as MAX_MARKER_BYTES,
  isSyncWorkspaceDiscoveryName,
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

async function readMarker(
  remote: SyncRemoteStore,
  signal: AbortSignal,
  prefix = '',
  distinguishMissingRead = false
) {
  let observed = false;
  const key = `${prefix}${MARKER_KEY}`;
  try {
    const { size } = await remote.stat(key, signal);
    observed = true;
    signal.throwIfAborted();
    if (!Number.isSafeInteger(size) || size < 0) throw new SyncWorkspaceError('invalid-marker');
    if (size > MAX_MARKER_BYTES) throw new SyncWorkspaceError('metadata-limit');
    const stream = await remote.read(key, signal);
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
      throw new SyncWorkspaceError(
        observed && distinguishMissingRead ? 'workspace-changed' : 'marker-missing'
      );
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

/** A verified marker observation. The caller must select it through the existing join owner. */
interface SyncWorkspaceDiscoveryCandidate {
  prefix: string;
  identity: SyncWorkspaceIdentity;
}
/** Fixed incomplete-search evidence. Prefixes are safe relative children, or the selected root. */
interface SyncWorkspaceDiscoveryIssue {
  prefix: string;
  code:
    | SyncWorkspaceError['code']
    | SyncRemoteError['code']
    | 'bootstrap-incomplete'
    | 'pagination-cycle';
}
/** Complete empty observations require no candidates and no issues; this grants no creation authority. */
export interface SyncWorkspaceDiscovery {
  scope: 'exact' | 'children';
  complete: boolean;
  candidates: SyncWorkspaceDiscoveryCandidate[];
  issues: SyncWorkspaceDiscoveryIssue[];
}
const DISCOVERY_MAX_PAGES = 16;
const DISCOVERY_MAX_ENTRIES = 256;
const DISCOVERY_MAX_CHILDREN = 64;

function discoveryCode(error: unknown, signal: AbortSignal): SyncWorkspaceDiscoveryIssue['code'] {
  if (signal.aborted) throw new SyncWorkspaceError('cancelled');
  if (error instanceof SyncWorkspaceError || error instanceof SyncRemoteError) {
    if (error.code === 'cancelled') throw new SyncWorkspaceError('cancelled');
    return error.code;
  }
  return 'unavailable';
}
function immediateDiscoveryKey(value: unknown, directory: boolean): value is string {
  return (
    typeof value === 'string' &&
    value.endsWith('/') === directory &&
    isSyncWorkspaceDiscoveryName(directory ? value.slice(0, -1) : value)
  );
}

/**
 * Observe the selected root, or at most its immediate children, without writes or enrollment.
 * The caller owns endpoint authorization. Catalog admission remains with prepareSyncWorkspaceJoin.
 */
export async function discoverSyncWorkspaces(
  remote: SyncRemoteStore,
  signal: AbortSignal
): Promise<SyncWorkspaceDiscovery> {
  const result: SyncWorkspaceDiscovery = {
    scope: 'exact',
    complete: false,
    candidates: [],
    issues: [],
  };
  try {
    signal.throwIfAborted();
    const identity = await readMarker(remote, signal, '', true);
    signal.throwIfAborted();
    return { ...result, complete: true, candidates: [{ prefix: '', identity }] };
  } catch (error) {
    const code = discoveryCode(error, signal);
    if (code !== 'marker-missing') return { ...result, issues: [{ prefix: '', code }] };
  }
  result.scope = 'children';
  const children: string[] = [];
  const seenKeys = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let entries = 0;
  let ended = false;
  for (let pageNumber = 0; pageNumber < DISCOVERY_MAX_PAGES; pageNumber++) {
    try {
      signal.throwIfAborted();
      const page = await remote.list('', { signal, ...(cursor === undefined ? {} : { cursor }) });
      signal.throwIfAborted();
      if (
        !page ||
        !Array.isArray(page.objects) ||
        !Array.isArray(page.prefixes) ||
        !(
          page.nextCursor === null ||
          (typeof page.nextCursor === 'string' &&
            page.nextCursor.length > 0 &&
            page.nextCursor.length <= 1024)
        )
      )
        throw new SyncRemoteError('invalid-response');
      entries += page.objects.length + page.prefixes.length;
      if (entries > DISCOVERY_MAX_ENTRIES) throw new SyncWorkspaceError('metadata-limit');
      for (const object of page.objects) {
        if (
          !object ||
          !immediateDiscoveryKey(object.key, false) ||
          !Number.isSafeInteger(object.size) ||
          object.size < 0 ||
          seenKeys.has(object.key)
        )
          throw new SyncRemoteError('invalid-response');
        seenKeys.add(object.key);
      }
      for (const prefix of page.prefixes) {
        if (!immediateDiscoveryKey(prefix, true) || seenKeys.has(prefix.slice(0, -1))) {
          result.issues.push({ prefix: '', code: 'invalid-response' });
          continue;
        }
        seenKeys.add(prefix.slice(0, -1));
        if (prefix === '.sniptale/') {
          result.issues.push({ prefix: '', code: 'bootstrap-incomplete' });
          continue;
        }
        if (children.length >= DISCOVERY_MAX_CHILDREN)
          throw new SyncWorkspaceError('metadata-limit');
        children.push(prefix);
      }
      if (page.nextCursor === null) {
        ended = true;
        break;
      }
      if (seenCursors.has(page.nextCursor)) {
        result.issues.push({ prefix: '', code: 'pagination-cycle' });
        ended = true;
        break;
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    } catch (error) {
      result.issues.push({ prefix: '', code: discoveryCode(error, signal) });
      ended = true;
      break;
    }
  }
  if (!ended) result.issues.push({ prefix: '', code: 'metadata-limit' });
  for (const prefix of children) {
    try {
      signal.throwIfAborted();
      const identity = await readMarker(remote, signal, prefix, true);
      signal.throwIfAborted();
      result.candidates.push({ prefix, identity });
    } catch (error) {
      const code = discoveryCode(error, signal);
      if (code !== 'marker-missing') result.issues.push({ prefix, code });
    }
  }
  result.complete = result.issues.length === 0;
  return result;
}
