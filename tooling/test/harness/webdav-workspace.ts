import {
  createSyncWorkspaceAllocation,
  loadSyncWorkspaceAllocation,
  commandSyncWorkspaceAllocation,
} from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-allocation';
import { withSyncConnectionAdmissionLock } from '../../../apps/extension/src/composition/persistence/remote-connection/coordination';
import { sameSyncConnectionIdentity } from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  allocateWebdavWorkspaceRoot,
  createWebdavWorkspaceWriter,
  createWebdavRemoteStore,
} from '../../../apps/extension/src/workflows/sync-transfer/webdav';
import { finishWebdavWorkspaceCreation } from '../../../apps/extension/src/workflows/sync-transfer/webdav-workspace';
import {
  prepareSyncWorkspaceJoin,
  SyncWorkspaceError,
} from '../../../apps/extension/src/workflows/sync-transfer/workspace';
import type { SyncWorkspaceAllocation } from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-allocation';
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

/** Bind each HTTP dispatch to the exact current local creation revision. */
function writerOptions(credentials: Credentials, plan: SyncWorkspaceAllocation) {
  if (plan.parentUrl !== credentials.rootUrl || plan.accountId !== credentials.username)
    throw new SyncRemoteError('invalid-configuration');
  const base = options({ ...credentials, rootUrl: plan.rootUrl });
  return {
    ...base,
    request: (signal: AbortSignal, issue: (signal: AbortSignal) => Promise<Response>) =>
      base.request(signal, (admittedSignal) =>
        withSyncConnectionAdmissionLock(async () => {
          const current = await loadSyncWorkspaceAllocation();
          if (
            !current ||
            current.phase !== plan.phase ||
            !sameSyncConnectionIdentity(current.identity, plan.identity)
          )
            throw new SyncRemoteError('invalid-configuration');
          admittedSignal.throwIfAborted();
          return { response: issue(admittedSignal) };
        }).then((admitted) => admitted.response)
      ),
  };
}

/** Explicit test-only allocation ingress. It installs no profile and enables no capture. */
export function createWebdavWorkspaceHarness() {
  return {
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
      try {
        const plan = await loadSyncWorkspaceAllocation();
        if (
          !plan ||
          plan.parentUrl !== credentials.rootUrl ||
          plan.accountId !== credentials.username
        )
          throw new SyncRemoteError('invalid-configuration');
        const reserved = await commandSyncWorkspaceAllocation(identity, 'allocate');
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
        return { ...failure(error), allocation: await loadSyncWorkspaceAllocation() };
      }
    },
    async finish(credentials: Credentials, identity: unknown) {
      try {
        const result = await finishWebdavWorkspaceCreation(
          (plan, signal) => createWebdavWorkspaceWriter(writerOptions(credentials, plan), signal),
          identity,
          new AbortController().signal
        );
        return { code: 'success', status: null, ...result };
      } catch (error) {
        return { ...failure(error), allocation: await loadSyncWorkspaceAllocation() };
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
