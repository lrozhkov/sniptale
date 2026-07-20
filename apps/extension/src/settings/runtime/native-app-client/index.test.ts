import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));

describe('settings native app runtime client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  });

  it('sends native app query messages through the owner transport', async () => {
    const { createNativeAppRuntimeClient } = await import('./index');
    const client = createNativeAppRuntimeClient({ sendRuntimeMessage: mocks.sendRuntimeMessage });

    await expect(client.query()).resolves.toEqual({ success: true });
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.NATIVE_APP_QUERY })
    );
  });

  it('sends native app mutation messages through the owner transport', async () => {
    const { createNativeAppRuntimeClient } = await import('./index');
    const client = createNativeAppRuntimeClient({ sendRuntimeMessage: mocks.sendRuntimeMessage });

    await client.mutate('sync-settings');
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'sync-settings',
        type: MessageType.NATIVE_APP_MUTATION,
      })
    );
  });
});
