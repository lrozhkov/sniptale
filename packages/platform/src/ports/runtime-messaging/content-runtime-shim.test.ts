import { afterEach, expect, it, vi } from 'vitest';

import { RUNTIME_MESSAGE_FRESHNESS_FIELD } from '../../security/runtime-message-freshness';
import { sendContentRuntimeShimMessage } from './content-runtime-shim';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('sends content runtime shim messages with runtime freshness', async () => {
  const sendMessage = vi.fn(async () => ({ success: true }));
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: { sendMessage },
    },
  });

  await expect(sendContentRuntimeShimMessage({ action: 'wake', type: 'PING' })).resolves.toEqual({
    success: true,
  });

  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      [RUNTIME_MESSAGE_FRESHNESS_FIELD]: expect.objectContaining({
        issuedAtEpochMs: expect.any(Number),
        nonce: expect.any(String),
      }),
      action: 'wake',
      type: 'PING',
    })
  );
});
