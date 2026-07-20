import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
import { showRecordingOverlay, wait } from './shared';

beforeEach(() => {
  vi.clearAllMocks();
});

it('shows the recording overlay through the background runtime messaging service', async () => {
  const sendTabMessage = vi.fn().mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendTabMessage });
  const region = { x: 1, y: 2, width: 320, height: 180 };

  await showRecordingOverlay(7, region);

  expect(sendTabMessage).toHaveBeenCalledWith(7, {
    type: VideoMessageType.SHOW_RECORDING_OVERLAY,
    region,
  });
});

it('resolves wait after the requested delay', async () => {
  vi.useFakeTimers();
  const resolved = vi.fn();

  void wait(250).then(resolved);
  await vi.advanceTimersByTimeAsync(249);
  expect(resolved).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);

  expect(resolved).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
