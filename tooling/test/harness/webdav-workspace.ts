import {
  createSyncWorkspaceAllocation,
  loadSyncWorkspaceAllocation,
  commandSyncWorkspaceAllocation,
  recordSyncWorkspaceAllocationRefusal,
} from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-allocation';
import { withSyncConnectionAdmissionLock } from '../../../apps/extension/src/composition/persistence/remote-connection/coordination';
import {
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  allocateWebdavWorkspaceRoot,
  createWebdavWorkspaceWriter,
  createWebdavRemoteStore,
} from '../../../apps/extension/src/workflows/sync-transfer/webdav';
import { createWebdavWorkspaceCreation } from '../../../apps/extension/src/workflows/sync-transfer/webdav-workspace';
import {
  prepareSyncWorkspaceJoin,
  SyncWorkspaceError,
} from '../../../apps/extension/src/workflows/sync-transfer/workspace';
import { SyncRemoteError } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

type Credentials = { rootUrl: string; username: string; password: string };
function failure(error: unknown) {
  return error instanceof SyncRemoteError
    ? { code: error.code, status: error.status }
    : error instanceof SyncWorkspaceError
      ? { code: error.code, status: null }
      : { code: 'refused', status: null };
}
function options(credentials: Credentials) {
  return {
    rootUrl: credentials.rootUrl,
    authentication: {
      kind: 'basic' as const,
      username: credentials.username,
      password: credentials.password,
    },
    request: async (signal: AbortSignal, issue: (signal: AbortSignal) => Promise<Response>) => {
      if (
        !(await chrome.permissions.contains({
          origins: [`${new URL(credentials.rootUrl).origin}/*`],
        }))
      )
        throw new SyncRemoteError('access-denied');
      return issue(signal);
    },
  };
}

/** Explicit test-only allocation ingress. It installs no profile and enables no capture. */
export function createWebdavWorkspaceHarness() {
  let active: ReturnType<typeof createWebdavWorkspaceCreation> | null = null;
  return {
    async stop() {
      await active?.close();
      return { code: 'contained' };
    },
    async plan(credentials: Credentials, expected: unknown = null) {
      // The connection page loads native state before it enables an explicit creation command.
      await loadSyncWorkspaceAllocation();
      return createSyncWorkspaceAllocation(
        { parentUrl: credentials.rootUrl, accountId: credentials.username },
        expected
      );
    },
    inspect: () => loadSyncWorkspaceAllocation(),
    abandon: (identity: unknown) => commandSyncWorkspaceAllocation(identity, 'abandon'),
    async allocate(credentials: Credentials, identity: unknown) {
      let reservedIdentity: SyncConnectionIdentity | null = null;
      try {
        const plan = await loadSyncWorkspaceAllocation();
        if (
          !plan ||
          plan.parentUrl !== credentials.rootUrl ||
          plan.accountId !== credentials.username
        )
          throw new SyncRemoteError('invalid-configuration');
        const reserved = await commandSyncWorkspaceAllocation(identity, 'allocate');
        reservedIdentity = reserved.identity;
        const base = options({ ...credentials, rootUrl: reserved.rootUrl });
        await allocateWebdavWorkspaceRoot(
          {
            ...base,
            request: (signal, issue) =>
              base.request(signal, (admittedSignal) =>
                withSyncConnectionAdmissionLock(async () => {
                  const current = await loadSyncWorkspaceAllocation();
                  if (
                    !current ||
                    current.phase !== 'allocating' ||
                    !sameSyncConnectionIdentity(current.identity, reserved.identity)
                  )
                    throw new SyncRemoteError('invalid-configuration');
                  admittedSignal.throwIfAborted();
                  return { response: issue(admittedSignal) };
                }).then((admitted) => admitted.response)
              ),
          },
          new AbortController().signal
        );
        const allocated = await commandSyncWorkspaceAllocation(reserved.identity, 'confirm');
        return { code: 'success', status: null, allocation: allocated };
      } catch (error) {
        // Only an explicit refusal proves that this MKCOL did not create the child.
        if (reservedIdentity && error instanceof SyncRemoteError && error.status === 423)
          await recordSyncWorkspaceAllocationRefusal(reservedIdentity, error.status);
        return { ...failure(error), allocation: await loadSyncWorkspaceAllocation() };
      }
    },
    async finish(credentials: Credentials, identity: unknown) {
      let execution: ReturnType<typeof createWebdavWorkspaceCreation> | null = null;
      try {
        if (active) throw new SyncRemoteError('invalid-configuration');
        execution = createWebdavWorkspaceCreation({
          identity,
          authentication: {
            kind: 'basic',
            username: credentials.username,
            password: credentials.password,
          },
          hasOriginPermission: (origin) =>
            chrome.permissions.contains({ origins: [`${origin}/*`] }),
        });
        active = execution;
        const result = await execution.run();
        return { code: 'success', status: null, ...result };
      } catch (error) {
        return { ...failure(error), allocation: await loadSyncWorkspaceAllocation() };
      } finally {
        if (execution) {
          try {
            await execution.close();
          } finally {
            if (active === execution) active = null;
          }
        }
      }
    },
    async join(credentials: Credentials, expected: unknown = null) {
      try {
        const signal = new AbortController().signal;
        const remote = await createWebdavRemoteStore(options(credentials), signal);
        const result = await prepareSyncWorkspaceJoin(remote, signal, expected);
        return { code: 'success', status: null, ...result };
      } catch (error) {
        return failure(error);
      }
    },
    async directPublish(credentials: Credentials, marker: unknown) {
      try {
        const signal = new AbortController().signal;
        const writer = await createWebdavWorkspaceWriter(options(credentials), signal);
        await writer.publishMarker(marker, signal);
        return { code: 'success', status: null };
      } catch (error) {
        return failure(error);
      }
    },
    async directAllocate(credentials: Credentials) {
      try {
        await allocateWebdavWorkspaceRoot(options(credentials), new AbortController().signal);
        return { code: 'success', status: null };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
