import { expect, it, vi } from 'vitest';
import { openPageToolbarFromShim, savePageCornerFromShim } from './launcher';
function transport() {
  const responses = [
    {
      success: true,
      activationKey: { expiresAtEpochMs: Date.now() + 30_000, keyId: 'key-1', secret: 's-1' },
    },
    { success: true, runtimeToken: { runtimeToken: 'runtime-1' } },
    { success: true, trustedEventProof: { proofToken: 'proof-1' } },
    { success: true, contentIntent: { requestId: 'request-1', token: 'capability-1' } },
    { success: true },
  ];
  const send = vi.fn(async () => responses.shift());
  return { send, responses, deps: { sendRuntimeMessage: send, requestId: () => 'request-1' } };
}
it('opens the toolbar only after the existing trusted capability handshake', async () => {
  const { send, deps } = transport();
  await openPageToolbarFromShim(deps);
  expect(send.mock.calls).toHaveLength(5);
  expect(send).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ actionType: 'ENABLE_SCREENSHOT_MODE', requestId: 'request-1' })
  );
  expect(send).toHaveBeenLastCalledWith({
    type: 'ENABLE_SCREENSHOT_MODE',
    contentIntent: { requestId: 'request-1', token: 'capability-1' },
  });
});
it.each([0, 1, 2, 3, 4])(
  'refuses the open operation if handshake stage %s fails',
  async (stage) => {
    const { send, responses, deps } = transport();
    responses[stage] = { success: false };
    await expect(openPageToolbarFromShim(deps)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(stage + 1);
  }
);
it('writes only the bounded corner and returns the authoritative native result', async () => {
  const send = vi.fn(async () => ({ success: true, corner: 'top-right' }));
  await expect(savePageCornerFromShim('top-left', { sendRuntimeMessage: send })).resolves.toBe(
    'top-right'
  );
  expect(send).toHaveBeenCalledWith({ type: 'PAGE_LAUNCH_PREFERENCES', corner: 'top-left' });
});
it('refuses malformed native acknowledgements and permits a fresh explicit retry', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ success: false, error: 'refused' })
    .mockResolvedValueOnce({ success: true, corner: 'center' })
    .mockResolvedValueOnce({ success: true, corner: 'bottom-left' });
  const deps = { sendRuntimeMessage: send };
  await expect(savePageCornerFromShim('bottom-left', deps)).rejects.toThrow('refused');
  await expect(savePageCornerFromShim('bottom-left', deps)).rejects.toThrow('response');
  await expect(savePageCornerFromShim('bottom-left', deps)).resolves.toBe('bottom-left');
});
