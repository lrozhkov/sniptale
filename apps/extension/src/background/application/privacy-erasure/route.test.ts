import { beforeEach, expect, it, vi } from 'vitest';

const { eraseLocalExtensionDataFromBackgroundMock, loggerErrorMock } = vi.hoisted(() => ({
  eraseLocalExtensionDataFromBackgroundMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}));

vi.mock('./composition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composition')>()),
  eraseLocalExtensionDataFromBackground: eraseLocalExtensionDataFromBackgroundMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../runtime-state';
import { routeLocalDataErasureMessage } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  eraseLocalExtensionDataFromBackgroundMock.mockResolvedValue({
    failedRequiredParticipantIds: [],
    indexedDbStoresCleared: 1,
    localStorageKeysRemoved: [],
    participants: [],
    success: true,
    sessionStorageKeysRemoved: [],
    syncStorageKeysRemoved: [],
  });
});

it('ignores unrelated runtime messages', () => {
  const sendResponse = vi.fn();

  expect(
    routeLocalDataErasureMessage(
      { type: 'OTHER_MESSAGE' },
      sendResponse,
      createBackgroundRuntimeState()
    )
  ).toBe(false);

  expect(sendResponse).not.toHaveBeenCalled();
  expect(eraseLocalExtensionDataFromBackgroundMock).not.toHaveBeenCalled();
});

it('returns an error when background erasure fails', async () => {
  const sendResponse = vi.fn();
  const state = createBackgroundRuntimeState();
  const message = {
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: true,
    preservePreferences: false,
  };
  eraseLocalExtensionDataFromBackgroundMock.mockRejectedValueOnce(
    new Error('secret-bearing erase failure')
  );

  expect(routeLocalDataErasureMessage(message, sendResponse, state)).toBe(true);

  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Local data erasure failed',
  });
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to erase local extension data');
  expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain('secret-bearing');
});

it('runs preauthorized local data erasure and returns the result', async () => {
  const sendResponse = vi.fn();
  const state = createBackgroundRuntimeState();
  const message = {
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: true,
    preservePreferences: false,
  };

  expect(routeLocalDataErasureMessage(message, sendResponse, state)).toBe(true);

  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(eraseLocalExtensionDataFromBackgroundMock).toHaveBeenCalledWith(message, state);
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: {
      failedRequiredParticipantIds: [],
      indexedDbStoresCleared: 1,
      localStorageKeysRemoved: [],
      participants: [],
      success: true,
      sessionStorageKeysRemoved: [],
      syncStorageKeysRemoved: [],
    },
  });
});

it('returns a partial failure when required erasure participants remain dirty', async () => {
  const sendResponse = vi.fn();
  const state = createBackgroundRuntimeState();
  const message = {
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: true,
    preservePreferences: false,
  };
  eraseLocalExtensionDataFromBackgroundMock.mockResolvedValueOnce({
    failedRequiredParticipantIds: ['indexed-db:editor-bootstrap'],
    indexedDbStoresCleared: 1,
    localStorageKeysRemoved: [],
    participants: [
      {
        id: 'indexed-db:editor-bootstrap',
        remainingCount: 1,
        severity: 'required',
        status: 'failed',
      },
    ],
    success: false,
    sessionStorageKeysRemoved: [],
    syncStorageKeysRemoved: [],
  });

  expect(routeLocalDataErasureMessage(message, sendResponse, state)).toBe(true);

  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Local data erasure failed: indexed-db:editor-bootstrap',
    result: expect.objectContaining({
      failedRequiredParticipantIds: ['indexed-db:editor-bootstrap'],
      success: false,
    }),
    success: false,
  });
});
