import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const mocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));

import { setViewportOutputFrozen } from './output-state';

const binding = {
  generation: 2,
  recordingId: 'recording-1',
  streamInstanceId: 'stream-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, result: 'applied' });
});

it('binds viewport output transitions to the active source generation and navigation token', async () => {
  await expect(setViewportOutputFrozen(binding, true, 'navigation-1')).resolves.toBe('applied');

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      frozen: true,
      generation: 2,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      transitionId: 'navigation-1',
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    })
  );
});

it('returns stale acknowledgements and rejects an untyped acknowledgement', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true, result: 'stale' });
  await expect(setViewportOutputFrozen(binding, false, 'navigation-1')).resolves.toBe('stale');

  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true });
  await expect(setViewportOutputFrozen(binding, false, 'navigation-1')).rejects.toThrow(
    'Viewport output frame state could not be updated'
  );
});
