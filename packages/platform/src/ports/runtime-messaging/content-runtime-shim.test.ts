import { afterEach, expect, it, vi } from 'vitest';

import { RUNTIME_MESSAGE_FRESHNESS_FIELD } from '../../security/runtime-message-freshness';
import { sendContentRuntimeShimMessage } from './content-runtime-shim';

afterEach(() => {
  vi.unstubAllGlobals();
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

it('rejects without sending when secure randomness is unavailable', async () => {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  vi.stubGlobal('crypto', {});
  const result = sendContentRuntimeShimMessage({ type: 'CONTENT_RUNTIME_WAKEUP' });
  await expect(result).rejects.toThrow('Runtime message nonce generation is unavailable.');
  expect(sendMessage).not.toHaveBeenCalled();
});

it('sends a fresh wakeup envelope on an HTTP crypto surface', async () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  const sendMessage = vi.fn().mockResolvedValue({ success: true });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  await expect(sendContentRuntimeShimMessage({ type: 'CONTENT_RUNTIME_WAKEUP' })).resolves.toEqual({
    success: true,
  });
  expect(sendMessage).toHaveBeenCalledWith({
    type: 'CONTENT_RUNTIME_WAKEUP',
    __sniptaleRuntimeFreshness: { issuedAtEpochMs: expect.any(Number), nonce: expect.any(String) },
  });
});
