import {
  reconcileStoredAISecretUnlockRequests,
  transitionStoredAISecretUnlockRequest,
  transitionStoredAISecretUnlockRequestFromStatuses,
  upsertStoredAISecretUnlockRequest,
  type StoredAISecretUnlockRequest,
  type StoredAISecretUnlockRequestStatus,
} from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';

export type UnlockRequestMemoryDomain = {
  clear(): void;
  delete(key: string): void;
  set(key: string, value: StoredAISecretUnlockRequest): void;
};

function cacheUnlockRequests(
  unlockRequests: UnlockRequestMemoryDomain,
  records: ReadonlyMap<string, StoredAISecretUnlockRequest>
): void {
  unlockRequests.clear();
  for (const [requestId, record] of records.entries()) {
    unlockRequests.set(requestId, record);
  }
}

export async function reconcileUnlockRequests(
  unlockRequests: UnlockRequestMemoryDomain,
  now = Date.now()
): Promise<Map<string, StoredAISecretUnlockRequest>> {
  const records = await reconcileStoredAISecretUnlockRequests(now);
  cacheUnlockRequests(unlockRequests, records);
  return records;
}

export async function writeUnlockRequest(
  unlockRequests: UnlockRequestMemoryDomain,
  record: StoredAISecretUnlockRequest
): Promise<void> {
  unlockRequests.set(record.requestId, record);
  await upsertStoredAISecretUnlockRequest(record);
}

export async function readUnlockRequest(
  unlockRequests: UnlockRequestMemoryDomain,
  requestId: string
): Promise<StoredAISecretUnlockRequest | null> {
  const records = await reconcileUnlockRequests(unlockRequests);
  return records.get(requestId) ?? null;
}

export async function transitionUnlockRequest(
  unlockRequests: UnlockRequestMemoryDomain,
  args: {
    next: StoredAISecretUnlockRequest;
    requestId: string;
    requireStatus: StoredAISecretUnlockRequest['status'];
  }
): Promise<ReturnType<typeof transitionStoredAISecretUnlockRequest>> {
  const transition = await transitionStoredAISecretUnlockRequest(args);
  if (transition.transitioned) {
    unlockRequests.set(args.requestId, transition.record);
    return transition;
  }
  if (transition.record) {
    unlockRequests.set(args.requestId, transition.record);
  } else {
    unlockRequests.delete(args.requestId);
  }
  return transition;
}

export async function transitionUnlockRequestFromStatuses(
  unlockRequests: UnlockRequestMemoryDomain,
  args: {
    createNext: (current: StoredAISecretUnlockRequest) => StoredAISecretUnlockRequest;
    requestId: string;
    requireStatuses: ReadonlySet<StoredAISecretUnlockRequestStatus>;
  }
): Promise<ReturnType<typeof transitionStoredAISecretUnlockRequestFromStatuses>> {
  const transition = await transitionStoredAISecretUnlockRequestFromStatuses(args);
  if (transition.transitioned) {
    unlockRequests.set(args.requestId, transition.record);
    return transition;
  }
  if (transition.record) {
    unlockRequests.set(args.requestId, transition.record);
  } else {
    unlockRequests.delete(args.requestId);
  }
  return transition;
}
