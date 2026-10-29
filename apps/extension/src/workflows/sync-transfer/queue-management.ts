import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  commandSyncQueue,
  commandSyncQueueOperation,
  loadSyncQueuePage,
} from '../../composition/persistence/sync-capture/queue';
import { loadSyncQueueHistoryEnrollment } from '../../composition/persistence/sync-capture/queue-history-scan';
import {
  parseSyncQueueScope,
  queueIdentity,
  queueOrdinal,
  type SyncQueueScope,
} from '../../composition/persistence/sync-capture/queue-model';
import { deliverSyncQueueHistory } from './queue-history';

interface QueueManagementDependencies {
  enrollment: typeof loadSyncQueueHistoryEnrollment;
  page: typeof loadSyncQueuePage;
  queueCommand: typeof commandSyncQueue;
  operationCommand: typeof commandSyncQueueOperation;
  history: typeof deliverSyncQueueHistory;
}
const nativeDependencies: QueueManagementDependencies = {
  enrollment: loadSyncQueueHistoryEnrollment,
  page: loadSyncQueuePage,
  queueCommand: commandSyncQueue,
  operationCommand: commandSyncQueueOperation,
  history: deliverSyncQueueHistory,
};
type QueueManagementCommand =
  | { kind: 'queue'; scope: SyncQueueScope; revision: number; command: 'pause' | 'resume' }
  | {
      kind: 'operation';
      scope: SyncQueueScope;
      revision: number;
      operationId: string;
      command: 'pause' | 'resume' | 'retry' | 'cancel';
    };
function commandInput(value: unknown): QueueManagementCommand {
  const raw: unknown = structuredClone(value);
  if (!isRecord(raw)) throw new Error('Invalid queue selection.');
  const scope = parseSyncQueueScope(raw['scope']);
  const revision = raw['revision'];
  const command = raw['command'];
  if (!scope || !queueOrdinal(revision)) throw new Error('Invalid queue selection.');
  if (raw['kind'] === 'queue' && (command === 'pause' || command === 'resume'))
    return { kind: 'queue' as const, scope, revision, command };
  const operationId = raw['operationId'];
  if (
    raw['kind'] === 'operation' &&
    queueIdentity(operationId) &&
    (command === 'pause' || command === 'resume' || command === 'retry' || command === 'cancel')
  )
    return { kind: 'operation' as const, scope, revision, operationId, command };
  throw new Error('Invalid queue command.');
}

/** Manage native queue state only. Commands confer no transport or source-release authority. */
export function createSyncQueueManagement(deps: QueueManagementDependencies = nativeDependencies) {
  return {
    async read(cursor: unknown = null) {
      const selectedCursor: unknown = structuredClone(cursor);
      const scope = await deps.enrollment();
      if (!scope) return { kind: 'unconfigured' as const };
      const page = await deps.page(scope, { limit: 25, cursor: selectedCursor });
      return { kind: 'ready' as const, scope, ...page };
    },
    async command(value: unknown): Promise<
      | {
          kind: 'applied';
          history: 'delivered' | 'pending';
        }
      | { kind: 'refused' }
    > {
      let selection: ReturnType<typeof commandInput>;
      try {
        selection = commandInput(value);
        if (selection.kind === 'queue')
          await deps.queueCommand(selection.scope, selection.revision, selection.command);
        else
          await deps.operationCommand(
            selection.scope,
            selection.operationId,
            selection.revision,
            selection.command
          );
      } catch {
        return { kind: 'refused' };
      }
      // A diagnostic failure cannot turn a committed command into a refusal.
      const delivered = await deps
        .history(
          selection.scope,
          selection.kind === 'queue'
            ? { kind: 'connection' }
            : {
                kind: 'operation',
                operationId: selection.operationId,
              }
        )
        .catch(() => false);
      return { kind: 'applied', history: delivered ? 'delivered' : 'pending' };
    },
  };
}
