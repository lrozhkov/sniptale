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
} from '../../composition/persistence/remote-connection/workspace-join';
import { SyncCatalogError } from './catalog';
import { createSyncWorkspaceJoinRequests } from './connection-requests';
import { SyncRemoteError } from './remote-store';
import { createWebdavRemoteStore } from './webdav';
import { prepareSyncWorkspaceJoin, SyncWorkspaceError } from './workspace';

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

/**
 * Own one read-only JOIN check, bounded in-memory credentials and all issued IO.
 * Successful readiness is returned only after drain and an exact native completion.
 * Active close revokes the intent lifetime before it can authorize enrollment.
 */
export function createWebdavWorkspaceJoin(options: {
  identity: unknown;
  authentication: unknown;
  hasOriginPermission: (origin: string) => Promise<boolean>;
}) {
  let identity;
  let authentication: SyncConnectionAuthentication | null;
  try {
    identity = parseSyncConnectionIdentity(structuredClone(options.identity));
    authentication = detachedAuthentication(options.authentication);
  } catch {
    throw new SyncRemoteError('invalid-configuration');
  }
  if (!identity) throw new SyncRemoteError('invalid-configuration');
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
      authentication = parseConnectionAuthentication(authentication, selected.accountId);
      if (!authentication) throw new SyncRemoteError('invalid-configuration');
      const checking = await beginSyncWorkspaceJoin(selected.identity);
      signal.throwIfAborted();
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
      const checked = await prepareSyncWorkspaceJoin(remote, signal, checking.expected);
      await drain();
      signal.throwIfAborted();
      if (!(await hasOriginPermission(new URL(checking.rootUrl).origin)))
        throw new SyncRemoteError('access-denied');
      signal.throwIfAborted();
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
