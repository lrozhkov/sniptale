import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      local: {
        get: browserStorageLocalGetMock,
        set: browserStorageLocalSetMock,
      },
    },
  })
);

import {
  getRequestHistory,
  resetRequestHistoryWriteQueueForTests,
  saveRequestHistory,
} from './service-history';

function createHistoryEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    modelId: `model-${index + 1}`,
    requestKind: 'json' as const,
    status: 'success' as const,
    timestamp: index + 1,
    resultCount: index + 20,
  }));
}

function resetLlmServiceHistoryMocks() {
  vi.clearAllMocks();
  resetRequestHistoryWriteQueueForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(Date, 'now').mockReturnValue(5000);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyHistorySaveAndTrim() {
  browserStorageLocalGetMock.mockResolvedValue({
    llm_request_history: createHistoryEntries(10),
  });

  await saveRequestHistory({
    modelId: 'model-latest',
    requestKind: 'json',
    resultCount: 1,
  });

  expect(browserStorageLocalGetMock).toHaveBeenCalledWith(['llm_request_history']);
  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    llm_request_history: [
      {
        timestamp: 5000,
        modelId: 'model-latest',
        requestKind: 'json',
        resultCount: 1,
        status: 'success',
      },
      ...createHistoryEntries(10).slice(0, 9),
    ],
  });
  expect(console.log).toHaveBeenCalledWith('[BackgroundLlmHistory]', 'Request history saved');
}

async function verifyHistorySaveWithoutExistingEntries() {
  browserStorageLocalGetMock.mockResolvedValue({});

  await saveRequestHistory({
    requestKind: 'markdown',
    resultCount: 2,
  });

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    llm_request_history: [
      {
        timestamp: 5000,
        requestKind: 'markdown',
        resultCount: 2,
        status: 'success',
      },
    ],
  });
}

async function verifyFailureEntriesAreStoredWithErrorMetadata() {
  browserStorageLocalGetMock.mockResolvedValue({});

  await saveRequestHistory({
    error: 'Provider timeout token=sk-live-secret',
    modelId: 'model-failure',
    requestKind: 'json',
    resultCount: 0,
    status: 'failure',
  });

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    llm_request_history: [
      {
        timestamp: 5000,
        modelId: 'model-failure',
        requestKind: 'json',
        resultCount: 0,
        status: 'failure',
        errorCode: 'provider-failure',
      },
    ],
  });
}

async function verifyConcurrentHistoryWritesAreSerialized() {
  let storedHistory = createHistoryEntries(1);
  browserStorageLocalGetMock.mockImplementation(async () => ({
    llm_request_history: storedHistory,
  }));
  browserStorageLocalSetMock.mockImplementation(
    async (payload: { llm_request_history: typeof storedHistory }) => {
      storedHistory = payload.llm_request_history;
    }
  );

  await Promise.all([
    saveRequestHistory({
      modelId: 'model-first',
      requestKind: 'json',
      resultCount: 1,
    }),
    saveRequestHistory({
      modelId: 'model-second',
      requestKind: 'markdown',
      resultCount: 2,
    }),
  ]);

  expect(storedHistory.map((entry) => entry.modelId)).toEqual([
    'model-second',
    'model-first',
    'model-1',
  ]);
}

async function verifySaveFailureIsSwallowed() {
  const error = new Error('storage set failed');
  browserStorageLocalGetMock.mockRejectedValue(error);

  await expect(
    saveRequestHistory({
      requestKind: 'json',
      resultCount: 1,
    })
  ).resolves.toBeUndefined();

  expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    '[BackgroundLlmHistory]',
    'Failed to save request history',
    expect.objectContaining({ message: error.message })
  );
}

async function verifyHistoryReadContracts() {
  browserStorageLocalGetMock.mockResolvedValue({
    llm_request_history: createHistoryEntries(2),
  });

  await expect(getRequestHistory()).resolves.toEqual(createHistoryEntries(2));
}

async function verifyLegacyPromptEntriesAreDropped() {
  browserStorageLocalGetMock.mockResolvedValue({
    llm_request_history: [
      {
        timestamp: 1,
        prompt: 'Legacy prompt',
        resultCount: 1,
      },
      createHistoryEntries(1)[0],
    ],
  });

  await expect(getRequestHistory()).resolves.toEqual([createHistoryEntries(1)[0]]);
}

async function verifyLegacyRawErrorsAreDropped() {
  browserStorageLocalGetMock.mockResolvedValue({
    llm_request_history: [
      {
        timestamp: 1,
        modelId: 'model-raw-error',
        requestKind: 'json',
        resultCount: 0,
        status: 'failure',
        error: 'Provider echoed prompt token=sk-live-secret',
      },
      {
        timestamp: 2,
        requestKind: 'json',
        resultCount: 0,
        status: 'failure',
        errorCode: 'provider-invalid-response',
      },
    ],
  });

  await expect(getRequestHistory()).resolves.toEqual([
    {
      timestamp: 1,
      modelId: 'model-raw-error',
      requestKind: 'json',
      resultCount: 0,
      status: 'failure',
    },
    {
      timestamp: 2,
      requestKind: 'json',
      resultCount: 0,
      status: 'failure',
      errorCode: 'provider-invalid-response',
    },
  ]);
}

async function verifyHistoryReadFallback() {
  const error = new Error('storage get failed');
  browserStorageLocalGetMock.mockRejectedValue(error);

  await expect(getRequestHistory()).resolves.toEqual([]);
  expect(console.error).toHaveBeenCalledWith(
    '[BackgroundLlmHistory]',
    'Failed to load request history',
    expect.objectContaining({ message: error.message })
  );
}

describe('service-history', () => {
  beforeEach(resetLlmServiceHistoryMocks);

  it(
    'prepends the newest history entry and trims the stored list to ten items',
    verifyHistorySaveAndTrim
  );
  it(
    'creates a new history list when storage is initially empty',
    verifyHistorySaveWithoutExistingEntries
  );
  it(
    'stores failure entries with explicit error metadata',
    verifyFailureEntriesAreStoredWithErrorMetadata
  );
  it('serializes concurrent history writes', verifyConcurrentHistoryWritesAreSerialized);
  it('swallows save failures and reports them to the console', verifySaveFailureIsSwallowed);
  it(
    'returns the stored request history unchanged when storage succeeds',
    verifyHistoryReadContracts
  );
  it(
    'drops legacy prompt-bearing history entries during normalization',
    verifyLegacyPromptEntriesAreDropped
  );
  it('drops legacy raw error strings during normalization', verifyLegacyRawErrorsAreDropped);
  it('returns an empty array when reading request history fails', verifyHistoryReadFallback);
});
