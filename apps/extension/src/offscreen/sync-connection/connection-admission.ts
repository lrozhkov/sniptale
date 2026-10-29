import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
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
