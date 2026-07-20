import { expect, it, vi } from 'vitest';
import { triggerQuickActionFromShim } from './quick-action';

type SentMessage = Record<string, unknown>;

function createRuntimeMessagingAdapter() {
  const sentMessages: SentMessage[] = [];
  const sendRuntimeMessage = vi.fn(async (message: SentMessage) => {
    sentMessages.push(message);

    switch (message['type']) {
      case 'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY':
        return {
          activationKey: { expiresAtEpochMs: Date.now() + 30_000, keyId: 'key-1', secret: 's-1' },
          success: true,
        };
      case 'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN':
        return { runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true };
      case 'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF':
        return { success: true, trustedEventProof: { proofToken: 'proof-1' } };
      case 'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY':
        return {
          contentIntent: { requestId: 'request-1', token: 'capability-1' },
          success: true,
        };
      case 'TRIGGER_QUICK_ACTION':
        return { result: 'started', success: true };
      default:
        return { error: 'unexpected message', success: false };
    }
  });

  return { sendRuntimeMessage, sentMessages };
}

it('requests a content-action capability before triggering a quick action', async () => {
  const { sendRuntimeMessage, sentMessages } = createRuntimeMessagingAdapter();

  await triggerQuickActionFromShim(
    {
      hotkey: { altKey: false, ctrlKey: true, key: 'k', metaKey: false, shiftKey: false },
      id: 'quick-action-1',
      status: true,
    },
    { requestId: () => 'request-1', sendRuntimeMessage }
  );

  expect(sentMessages.map((message) => message['type'])).toEqual([
    'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY',
    'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN',
    'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF',
    'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY',
    'TRIGGER_QUICK_ACTION',
  ]);
  expect(sentMessages.at(-1)).toEqual(
    expect.objectContaining({
      actionId: 'quick-action-1',
      contentIntent: { requestId: 'request-1', token: 'capability-1' },
      type: 'TRIGGER_QUICK_ACTION',
    })
  );
});
