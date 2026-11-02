import { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import type { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionMetadata,
  type SyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/model';
import type { SyncExecutorBinding } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';

/** Read one current binding without granting another execution or credential lifetime. */
export async function readCurrentExecutionConnection(
  selection: SyncExecutorBinding,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const connection = await loadSyncConnection();
  if (
    !connection ||
    connection.phase !== 'active' ||
    !sameConnectionScope(connection.binding, selection.scope) ||
    !sameSyncConnectionIdentity(connection.identity, selection.authorization)
  )
    return null;
  signal.throwIfAborted();
  return connection;
}

/** The executor retains this lazy credential resolver and its protection lifetime. */
export interface SyncExecutionCredentials {
  resolveAuthentication(): Promise<SyncConnectionAuthentication>;
  checkProtection(): Promise<boolean>;
}

/** Compose caller-admitted binding and tracked requests without acquiring credential or drain ownership. */
export function createExecutionRemoteStore(
  connection: SyncConnectionMetadata,
  request: ReturnType<typeof createSyncConnectionRequests>['request'],
  credentials: SyncExecutionCredentials | undefined,
  signal: AbortSignal
) {
  return createWebdavRemoteStore(
    {
      rootUrl: connection.binding.rootUrl,
      authentication: () => {
        if (!credentials) return Promise.reject(new Error('Sync credential callback unavailable'));
        return credentials.resolveAuthentication();
      },
      request,
    },
    signal
  );
}
