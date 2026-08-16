import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

import { SettingsTransferClientError, createSettingsTransferClient } from '.';

const sendRuntimeMessage = vi.fn();
const sendSettingsTransferOperation = createSettingsTransferClient({ sendRuntimeMessage });

beforeEach(() => vi.clearAllMocks());

it('adds the canonical message type and returns a successful response', async () => {
  sendRuntimeMessage.mockResolvedValue({
    success: true,
    operation: 'read-export-tree',
    tree: [],
  });
  await expect(sendSettingsTransferOperation({ operation: 'read-export-tree' })).resolves.toEqual({
    success: true,
    operation: 'read-export-tree',
    tree: [],
  });
  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'read-export-tree',
  });
});

it('surfaces only the sanitized route error contract', async () => {
  sendRuntimeMessage.mockResolvedValue({
    success: false,
    operation: 'inspect-import',
    errorCode: 'invalid-package',
    error: 'Settings package is invalid',
  });
  await expect(
    sendSettingsTransferOperation({ operation: 'inspect-import', fileText: '{}' })
  ).rejects.toEqual(
    expect.objectContaining<Partial<SettingsTransferClientError>>({
      code: 'invalid-package',
      message: 'Settings package is invalid',
    })
  );
});

it.each([
  {
    response: { success: true, operation: 'commit-import', report: {} },
  },
  {
    response: {
      success: false,
      operation: 'inspect-import',
      errorCode: 'invalid-package',
      error: 'Invalid package',
    },
  },
])('rejects a response for a different operation before exposing it', async ({ response }) => {
  sendRuntimeMessage.mockResolvedValue(response);

  await expect(sendSettingsTransferOperation({ operation: 'read-export-tree' })).rejects.toEqual(
    expect.objectContaining<Partial<SettingsTransferClientError>>({
      code: 'operation-mismatch',
    })
  );
});
