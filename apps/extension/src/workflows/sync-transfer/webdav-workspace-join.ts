import {
  parseConnectionAuthentication,
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/model';
import {
  beginSyncWorkspaceJoin,
  completeSyncWorkspaceJoin,
  loadSyncWorkspaceJoin,
  revokeSyncWorkspaceJoin,
  type SyncWorkspaceJoin,
} from '../../composition/persistence/remote-connection/workspace-join';
import { SyncCatalogError } from './catalog';
import { createSyncWorkspaceJoinRequests } from './connection-requests';
import { SyncRemoteError } from './remote-store';
import { createWebdavRemoteStore } from './webdav';
import {
  discoverSyncWorkspaces,
  prepareSyncWorkspaceJoin,
  SyncWorkspaceError,
  type SyncWorkspaceDiscovery,
} from './workspace';

/** Fixed failures exclude endpoints, provider responses, credentials and native exceptions. */
class WebdavWorkspaceJoinError extends Error {
  constructor(readonly code: 'join-refused' | 'unavailable' | 'containment-failed') {
    super(code);
    this.name = 'WebdavWorkspaceJoinError';
  }
}

function detachedAuthentication(input: unknown) {
  let accountId = '';
  if (
    typeof input === 'object' &&
    input !== null &&
    'username' in input &&
    typeof input.username === 'string'
  )
    accountId = input.username;
  const parsed = parseConnectionAuthentication(input, accountId);
  if (!parsed) throw new SyncRemoteError('invalid-configuration');
  return parsed;
}

interface WebdavWorkspaceJoinOptions {
  identity: unknown;
  authentication: unknown;
  hasOriginPermission: (origin: string) => Promise<boolean>;
  operation?: 'discover';
}
type PreparedWorkspaceJoin = Awaited<ReturnType<typeof prepareSyncWorkspaceJoin>> & {
  intent: SyncWorkspaceJoin;
};
interface DiscoveredWorkspaceJoin {
  operation: 'discover';
  source: { kind: 'join'; identity: SyncWorkspaceJoin['identity'] };
  discovery: SyncWorkspaceDiscovery;
}
interface WorkspaceJoinHandle<T> {
  run(): Promise<T>;
  close(): Promise<void>;
}

/** Own one read-only JOIN check and all issued IO; only prepare can install native readiness. */
export function createWebdavWorkspaceJoin(
  options: WebdavWorkspaceJoinOptions & { operation?: undefined }
): WorkspaceJoinHandle<PreparedWorkspaceJoin>;
export function createWebdavWorkspaceJoin(
  options: WebdavWorkspaceJoinOptions & { operation: 'discover' }
): WorkspaceJoinHandle<DiscoveredWorkspaceJoin>;
export function createWebdavWorkspaceJoin(
  options: WebdavWorkspaceJoinOptions
): WorkspaceJoinHandle<PreparedWorkspaceJoin | DiscoveredWorkspaceJoin>;
export function createWebdavWorkspaceJoin(
  options: WebdavWorkspaceJoinOptions
): WorkspaceJoinHandle<PreparedWorkspaceJoin | DiscoveredWorkspaceJoin> {
  let identity;
  let authentication: SyncConnectionAuthentication | null;
  try {
    identity = parseSyncConnectionIdentity(structuredClone(options.identity));
    authentication = detachedAuthentication(options.authentication);
  } catch {
    throw new SyncRemoteError('invalid-configuration');
  }
  if (!identity) throw new SyncRemoteError('invalid-configuration');
  if (options.operation !== undefined && options.operation !== 'discover')
    throw new SyncRemoteError('invalid-configuration');
  const operation = options.operation;
  const selectedIdentity = identity;
  const hasOriginPermission = options.hasOriginPermission;
  const controller = new AbortController();
  let requests: ReturnType<typeof createSyncWorkspaceJoinRequests> | null = null;
  let running: Promise<Awaited<ReturnType<typeof execute>>> | null = null;
  let closing: Promise<void> | null = null;
  let settled = false;
  let contained = false;

  async function drain() {
    try {
      await requests?.close();
      contained = true;
    } catch {
      contained = false;
      throw new WebdavWorkspaceJoinError('containment-failed');
    } finally {
      authentication = null;
    }
  }
  async function execute() {
    const signal = controller.signal;
    try {
      signal.throwIfAborted();
      const selected = await loadSyncWorkspaceJoin();
      signal.throwIfAborted();
      if (!selected || !sameSyncConnectionIdentity(selected.identity, selectedIdentity))
        throw new WebdavWorkspaceJoinError('join-refused');
      if (operation === 'discover' && (selected.expected !== null || selected.workspace !== null))
        throw new WebdavWorkspaceJoinError('join-refused');
      authentication = parseConnectionAuthentication(authentication, selected.accountId);
      if (!authentication) throw new SyncRemoteError('invalid-configuration');
      const checking = await beginSyncWorkspaceJoin(selected.identity);
      signal.throwIfAborted();
      if (operation === 'discover' && checking.expected !== null)
        throw new WebdavWorkspaceJoinError('join-refused');
      requests = createSyncWorkspaceJoinRequests({ intent: checking, hasOriginPermission });
      const remote = await createWebdavRemoteStore(
        {
          rootUrl: checking.rootUrl,
          authentication: async () => {
            signal.throwIfAborted();
            if (!authentication) throw new SyncRemoteError('authentication');
            return authentication;
          },
          request: (requestSignal, issue) => {
            if (!requests) throw new SyncRemoteError('cancelled');
            return requests.request(checking.identity, requestSignal, issue);
          },
        },
        signal
      );
      const checked =
        operation === 'discover'
          ? await discoverSyncWorkspaces(remote, signal)
          : await prepareSyncWorkspaceJoin(remote, signal, checking.expected);
      await drain();
      signal.throwIfAborted();
      if (!(await hasOriginPermission(new URL(checking.rootUrl).origin)))
        throw new SyncRemoteError('access-denied');
      signal.throwIfAborted();
      if (operation === 'discover') {
        const current = await loadSyncWorkspaceJoin();
        signal.throwIfAborted();
        if (
          !current ||
          current.phase !== 'checking' ||
          current.expected !== null ||
          !sameSyncConnectionIdentity(current.identity, checking.identity) ||
          current.rootUrl !== checking.rootUrl ||
          current.accountId !== checking.accountId
        )
          throw new WebdavWorkspaceJoinError('join-refused');
        if (!('candidates' in checked)) throw new WebdavWorkspaceJoinError('join-refused');
        return {
          operation: 'discover' as const,
          source: { kind: 'join' as const, identity: checking.identity },
          discovery: checked,
        };
      }
      if (!('identity' in checked)) throw new WebdavWorkspaceJoinError('join-refused');
      const intent = await completeSyncWorkspaceJoin(checking.identity, checked.identity);
      // Close can revoke a ready revision while the completion result is in flight.
      signal.throwIfAborted();
      return { intent, ...checked };
    } catch (error) {
      await drain();
      if (signal.aborted) throw new SyncWorkspaceError('cancelled');
      if (
        error instanceof WebdavWorkspaceJoinError ||
        error instanceof SyncWorkspaceError ||
        error instanceof SyncRemoteError ||
        error instanceof SyncCatalogError
      )
        throw error;
      throw new WebdavWorkspaceJoinError('unavailable');
    } finally {
      settled = true;
    }
  }
  function run() {
    running ??= execute();
    return running;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    if (settled && contained) {
      closing = Promise.resolve();
      return closing;
    }
    const revocation = revokeSyncWorkspaceJoin(selectedIdentity.incarnation);
    controller.abort();
    closing = (async () => {
      // Always drain, including when durable revocation fails.
      const results = await Promise.allSettled([revocation, drain()]);
      if (running) await running.catch(() => undefined);
      if (results.some((result) => result.status === 'rejected') || !contained)
        throw new WebdavWorkspaceJoinError('containment-failed');
    })();
    return closing;
  }
  return { run, close };
}
