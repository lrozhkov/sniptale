import { beforeEach, expect, it, vi } from 'vitest';

import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from './constants';
import type { StoredAISecretUnlockRequest } from './secret-unlock-requests.store.ts';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    session: {
      get: browserStorageSessionGetMock,
      remove: browserStorageSessionRemoveMock,
      set: browserStorageSessionSetMock,
    },
  },
}));

import {
  clearStoredAISecretUnlockRequests,
  reconcileStoredAISecretUnlockRequests,
  transitionStoredAISecretUnlockRequest,
  transitionStoredAISecretUnlockRequestFromStatuses,
  upsertStoredAISecretUnlockRequest,
} from './secret-unlock-requests.store.ts';

let sessionState: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  sessionState = {};
  browserStorageSessionGetMock.mockImplementation(readSessionStorage);
  browserStorageSessionRemoveMock.mockImplementation(async (key: string) => {
    delete sessionState[key];
  });
  browserStorageSessionSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(sessionState, payload);
  });
});

async function readSessionStorage(key: string): Promise<Record<string, unknown>> {
  return {
    ...(key in sessionState ? { [key]: sessionState[key] } : {}),
  };
}

function createUnlockRequest(requestId: string): StoredAISecretUnlockRequest {
  return {
    createdAt: 1,
    expiresAt: 2,
    operation: 'ai-secret-unlock',
    purpose: 'content-ai-pick',
    requestId,
    senderKey: `sender:${requestId}`,
    status: 'pending',
  };
}

function getStoredUnlockRequestMap() {
  return sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] as
    | Record<string, StoredAISecretUnlockRequest>
    | undefined;
}

it('serializes concurrent independent unlock request writes', async () => {
  const storageReads: Array<() => void> = [];
  browserStorageSessionGetMock.mockImplementation(async (key: string) => {
    await new Promise<void>((resolve) => {
      storageReads.push(resolve);
    });
    return readSessionStorage(key);
  });

  const firstWrite = upsertStoredAISecretUnlockRequest(createUnlockRequest('request-1'));
  const secondWrite = upsertStoredAISecretUnlockRequest(createUnlockRequest('request-2'));

  await vi.waitFor(() => {
    expect(storageReads).toHaveLength(1);
  });
  storageReads.shift()?.();

  await vi.waitFor(() => {
    expect(storageReads).toHaveLength(1);
  });
  storageReads.shift()?.();

  await Promise.all([firstWrite, secondWrite]);
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toEqual({
    'request-1': expect.objectContaining({ requestId: 'request-1' }),
    'request-2': expect.objectContaining({ requestId: 'request-2' }),
  });
});

it('transitions from any allowed current status in one serialized storage task', async () => {
  await upsertStoredAISecretUnlockRequest(createUnlockRequest('request-1'));
  const storageReads: Array<() => void> = [];
  browserStorageSessionGetMock.mockImplementation(async (key: string) => {
    await new Promise<void>((resolve) => {
      storageReads.push(resolve);
    });
    return readSessionStorage(key);
  });

  const submitWrite = upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('request-1'),
    status: 'submitted',
  });
  const cancelWrite = transitionStoredAISecretUnlockRequestFromStatuses({
    createNext: (current) => ({
      ...current,
      status: 'failed',
      terminalFailureReason: 'cancelled',
    }),
    requestId: 'request-1',
    requireStatuses: new Set(['pending', 'submitted']),
  });

  await vi.waitFor(() => {
    expect(storageReads).toHaveLength(1);
  });
  storageReads.shift()?.();
  await vi.waitFor(() => {
    expect(storageReads).toHaveLength(1);
  });
  storageReads.shift()?.();

  await Promise.all([submitWrite, cancelWrite]);
  expect(getStoredUnlockRequestMap()?.['request-1']).toEqual(
    expect.objectContaining({ status: 'failed', terminalFailureReason: 'cancelled' })
  );
});

it('expires pending requests without rewriting submitted or terminal states', async () => {
  await upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('pending-request'),
    expiresAt: 1,
    status: 'pending',
  });
  await upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('submitted-request'),
    expiresAt: 1,
    status: 'submitted',
  });
  await upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('completed-request'),
    expiresAt: 1,
    status: 'completed',
  });
  await upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('failed-request'),
    expiresAt: 1,
    status: 'failed',
    terminalFailureReason: 'cancelled',
  });

  await reconcileStoredAISecretUnlockRequests(2);

  expect(getStoredUnlockRequestMap()?.['pending-request']?.status).toBe('expired');
  expect(getStoredUnlockRequestMap()?.['submitted-request']?.status).toBe('submitted');
  expect(getStoredUnlockRequestMap()?.['completed-request']?.status).toBe('completed');
  expect(getStoredUnlockRequestMap()?.['failed-request']).toEqual(
    expect.objectContaining({ status: 'failed', terminalFailureReason: 'cancelled' })
  );
});

it('scrubs otherwise valid records with unapproved retained fields during reconcile', async () => {
  sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] = {
    'request-1': {
      ...createUnlockRequest('request-1'),
      prompt: 'page payload must not be retained',
    },
  };

  await reconcileStoredAISecretUnlockRequests(1);

  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
});

it('clears the unlock request map through serialized session storage', async () => {
  await upsertStoredAISecretUnlockRequest(createUnlockRequest('request-1'));

  await clearStoredAISecretUnlockRequests();

  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
});

it('transitions one required status and rejects missing or stale requests', async () => {
  const pending = createUnlockRequest('request-1');
  const submitted = { ...pending, status: 'submitted' as const };
  await upsertStoredAISecretUnlockRequest(pending);

  await expect(
    transitionStoredAISecretUnlockRequest({
      next: submitted,
      requestId: pending.requestId,
      requireStatus: 'pending',
    })
  ).resolves.toEqual({ record: submitted, transitioned: true });
  await expect(
    transitionStoredAISecretUnlockRequest({
      next: pending,
      requestId: pending.requestId,
      requireStatus: 'pending',
    })
  ).resolves.toEqual({ record: submitted, transitioned: false });
  await expect(
    transitionStoredAISecretUnlockRequestFromStatuses({
      createNext: () => pending,
      requestId: 'missing',
      requireStatuses: new Set(['pending']),
    })
  ).resolves.toEqual({ record: null, transitioned: false });
});

it('does not rewrite a valid unlock request map when reconciliation has no changes', async () => {
  await upsertStoredAISecretUnlockRequest({
    ...createUnlockRequest('request-1'),
    expiresAt: 10,
  });
  browserStorageSessionSetMock.mockClear();

  await reconcileStoredAISecretUnlockRequests(1);

  expect(browserStorageSessionSetMock).not.toHaveBeenCalled();
});
