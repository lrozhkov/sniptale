import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

import { requestDefaultBorderPresetMutation } from './highlighter-settings-mutation';

const sendRuntimeMessage = vi.fn();
const messaging = { sendRuntimeMessage };

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessage.mockResolvedValue({ result: 'accepted', success: true });
});

it('sends content default changes to the background transaction authority', async () => {
  await requestDefaultBorderPresetMutation(messaging, 'system-marker');

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    operation: 'set-default-border-preset',
    presetId: 'system-marker',
    type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
  });
});

it('surfaces rejected background mutations', async () => {
  sendRuntimeMessage.mockResolvedValue({ error: 'denied', success: false });

  await expect(requestDefaultBorderPresetMutation(messaging, 'system-marker')).rejects.toThrow(
    'denied'
  );
});
