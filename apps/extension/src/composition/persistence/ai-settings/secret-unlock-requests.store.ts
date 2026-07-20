import { browserStorage } from '../infrastructure/browser-storage';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from './constants';
import {
  parseStoredAISecretUnlockRequests,
  type StoredAISecretUnlockRequest,
  type StoredAISecretUnlockRequestStatus,
} from './secret-unlock-requests.parser.ts';

export type {
  StoredAISecretUnlockRequest,
  StoredAISecretUnlockRequestStatus,
} from './secret-unlock-requests.parser.ts';

type AISecretUnlockRequestTransitionResult =
  | { record: StoredAISecretUnlockRequest; transitioned: true }
  | { record: StoredAISecretUnlockRequest | null; transitioned: false };

const EXPIRABLE_UNLOCK_STATUSES: ReadonlySet<StoredAISecretUnlockRequestStatus> = new Set([
  'pending',
]);
let unlockRequestStorageQueue: Promise<unknown> = Promise.resolve();

async function runSerializedUnlockRequestStorageTask<T>(task: () => Promise<T>): Promise<T> {
  const runTask = unlockRequestStorageQueue.then(task, task);
  unlockRequestStorageQueue = runTask.then(
    () => undefined,
    () => undefined
  );
  return runTask;
}

async function loadStoredAISecretUnlockRequestMap(): Promise<{
  isCorrupt: boolean;
  records: Map<string, StoredAISecretUnlockRequest>;
}> {
  const result = await browserStorage.session.get(AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY);
  return parseStoredAISecretUnlockRequests(result[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]);
}

async function writeStoredAISecretUnlockRequestMap(
  records: ReadonlyMap<string, StoredAISecretUnlockRequest>
): Promise<void> {
  if (records.size === 0) {
    await browserStorage.session.remove(AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY);
    return;
  }

  await browserStorage.session.set({
    [AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]: Object.fromEntries(records.entries()),
  });
}

export async function clearStoredAISecretUnlockRequests(): Promise<void> {
  await runSerializedUnlockRequestStorageTask(async () => {
    await browserStorage.session.remove(AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY);
  });
}

export async function reconcileStoredAISecretUnlockRequests(
  now = Date.now()
): Promise<Map<string, StoredAISecretUnlockRequest>> {
  return runSerializedUnlockRequestStorageTask(async () => {
    const { isCorrupt, records } = await loadStoredAISecretUnlockRequestMap();
    let changed = isCorrupt;

    for (const [requestId, record] of records.entries()) {
      if (record.expiresAt > now || !EXPIRABLE_UNLOCK_STATUSES.has(record.status)) {
        continue;
      }
      records.set(requestId, {
        ...record,
        status: 'expired',
        terminalFailureReason: 'AI secret unlock request expired',
      });
      changed = true;
    }

    if (changed) {
      await writeStoredAISecretUnlockRequestMap(records);
    }

    return records;
  });
}

export async function upsertStoredAISecretUnlockRequest(
  record: StoredAISecretUnlockRequest
): Promise<void> {
  await runSerializedUnlockRequestStorageTask(async () => {
    const { records } = await loadStoredAISecretUnlockRequestMap();
    records.set(record.requestId, record);
    await writeStoredAISecretUnlockRequestMap(records);
  });
}

export async function transitionStoredAISecretUnlockRequest(args: {
  next: Omit<StoredAISecretUnlockRequest, 'status'> & {
    status: StoredAISecretUnlockRequestStatus;
  };
  requestId: string;
  requireStatus: StoredAISecretUnlockRequestStatus;
}): Promise<AISecretUnlockRequestTransitionResult> {
  return runSerializedUnlockRequestStorageTask(async () => {
    const { records } = await loadStoredAISecretUnlockRequestMap();
    const current = records.get(args.requestId) ?? null;
    if (!current || current.status !== args.requireStatus) {
      return { record: current, transitioned: false };
    }

    records.set(args.requestId, args.next);
    await writeStoredAISecretUnlockRequestMap(records);
    return { record: args.next, transitioned: true };
  });
}

export async function transitionStoredAISecretUnlockRequestFromStatuses(args: {
  createNext: (current: StoredAISecretUnlockRequest) => StoredAISecretUnlockRequest;
  requestId: string;
  requireStatuses: ReadonlySet<StoredAISecretUnlockRequestStatus>;
}): Promise<AISecretUnlockRequestTransitionResult> {
  return runSerializedUnlockRequestStorageTask(async () => {
    const { records } = await loadStoredAISecretUnlockRequestMap();
    const current = records.get(args.requestId) ?? null;
    if (!current || !args.requireStatuses.has(current.status)) {
      return { record: current, transitioned: false };
    }

    const next = args.createNext(current);
    records.set(args.requestId, next);
    await writeStoredAISecretUnlockRequestMap(records);
    return { record: next, transitioned: true };
  });
}
