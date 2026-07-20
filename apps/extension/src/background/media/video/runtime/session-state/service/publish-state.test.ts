import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createVideoRecordingRuntimeStatePublisher } from './publish-state';

function createRuntimeState() {
  return {
    status: VideoRecordingStatus.RECORDING,
    duration: 12,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    liveMedia: null,
    error: null,
  };
}

describe('video-session-state publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the badge state, syncs the timer, and sends the runtime message', async () => {
    const applyBadgeState = vi.fn();
    const countdownBadgeTimer = { clear: vi.fn(), sync: vi.fn() };
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    const publisher = createVideoRecordingRuntimeStatePublisher({
      applyBadgeState,
      countdownBadgeTimer,
      sendRuntimeMessage,
    });

    const runtimeState = createRuntimeState();
    publisher.publishState(runtimeState);

    expect(applyBadgeState).toHaveBeenCalledWith(runtimeState);
    expect(countdownBadgeTimer.sync).toHaveBeenCalledTimes(1);
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: VideoMessageType.RECORDING_STATE_SYNC,
      state: runtimeState,
    });
  });

  it('swallows sync errors from the popup bridge', async () => {
    const applyBadgeState = vi.fn();
    const countdownBadgeTimer = { clear: vi.fn(), sync: vi.fn() };
    const sendRuntimeMessage = vi.fn().mockRejectedValueOnce(new Error('popup closed'));

    const publisher = createVideoRecordingRuntimeStatePublisher({
      applyBadgeState,
      countdownBadgeTimer,
      sendRuntimeMessage,
    });

    publisher.publishState(createRuntimeState());
    await Promise.resolve();

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
  });
});
