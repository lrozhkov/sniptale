import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CONNECTION_STORE } from '../infrastructure/indexed-db/core.stores';
import type { SyncWorkspaceSource } from './model';
import { readSyncWorkspaceAllocation } from './workspace-allocation';
import { readSyncWorkspaceJoin } from './workspace-join';

/** Credential-free projection of one live native intent, including retained enrollment evidence. */
export interface SyncWorkspaceSelection {
  source: SyncWorkspaceSource;
  /** Immutable native binding consistency token; this grants no authorization. */
  bindingKey: string;
  rootUrl: string;
  accountId: string;
  createdAt: number;
  phase: 'planned' | 'allocating' | 'allocated' | 'checking' | 'ready';
}

/** Read both native intents atomically. Malformed or conflicting evidence refuses without repair. */
export async function loadSyncWorkspaceSelection(): Promise<SyncWorkspaceSelection | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CONNECTION_STORE], 'readonly');
  try {
    const allocation = await readSyncWorkspaceAllocation(tx);
    const join = await readSyncWorkspaceJoin(tx);
    if (allocation && allocation.phase !== 'abandoned' && join)
      throw new Error('Sync workspace selection admission refused.');
    let selection: SyncWorkspaceSelection | null = null;
    if (join) {
      selection = {
        source: { kind: 'join', identity: join.identity },
        bindingKey: JSON.stringify([
          'join',
          join.rootUrl,
          join.accountId,
          join.createdAt,
          join.provider,
        ]),
        rootUrl: join.rootUrl,
        accountId: join.accountId,
        createdAt: join.createdAt,
        phase: join.phase,
      };
    } else if (allocation && allocation.phase !== 'abandoned') {
      selection = {
        source: { kind: 'allocation', identity: allocation.identity },
        bindingKey: JSON.stringify([
          'allocation',
          allocation.parentUrl,
          allocation.rootUrl,
          allocation.accountId,
          allocation.spaceId,
          allocation.bootstrapId,
          allocation.createdAt,
          allocation.provider,
        ]),
        rootUrl: allocation.rootUrl,
        accountId: allocation.accountId,
        createdAt: allocation.createdAt,
        phase:
          allocation.phase === 'preparing-marker' || allocation.phase === 'publishing-marker'
            ? 'checking'
            : allocation.phase,
      };
    }
    await tx.done;
    return selection;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}
