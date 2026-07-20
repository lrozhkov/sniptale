import { beforeEach, expect, it, vi } from 'vitest';

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
  loadStoredRequestHistoryEntries,
  saveStoredRequestHistoryEntries,
} from './request-history';

const validEntry = {
  timestamp: 100,
  modelId: 'model-1',
  requestKind: 'json' as const,
  resultCount: 2,
  status: 'failure' as const,
  errorCode: 'provider-invalid-response' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
});

it('returns an empty history for non-array storage payloads', async () => {
  browserStorageLocalGetMock.mockResolvedValue({ llm_request_history: { entry: validEntry } });

  await expect(loadStoredRequestHistoryEntries()).resolves.toEqual([]);
  expect(browserStorageLocalGetMock).toHaveBeenCalledWith(['llm_request_history']);
});

it('normalizes known fields and drops malformed persisted entries', async () => {
  const minimalEntry = {
    timestamp: 101,
    requestKind: 'markdown' as const,
    resultCount: 1,
    status: 'success' as const,
  };
  const legacyRawErrorEntry = {
    ...minimalEntry,
    timestamp: 102,
    error: 'raw provider output',
  };
  const invalidEntries = [
    null,
    { ...validEntry, timestamp: '100' },
    { ...validEntry, resultCount: '2' },
    { ...validEntry, status: 'pending' },
    { ...validEntry, requestKind: 'text' },
    { ...validEntry, modelId: 1 },
    { ...validEntry, errorCode: 'provider-secret-output' },
  ];
  browserStorageLocalGetMock.mockResolvedValue({
    llm_request_history: [validEntry, minimalEntry, legacyRawErrorEntry, ...invalidEntries],
  });

  await expect(loadStoredRequestHistoryEntries()).resolves.toEqual([
    validEntry,
    minimalEntry,
    { ...minimalEntry, timestamp: 102 },
  ]);
});

it('writes the unchanged metadata-only history schema under the canonical key', async () => {
  const history = [validEntry];

  await saveStoredRequestHistoryEntries(history);

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    llm_request_history: history,
  });
});
