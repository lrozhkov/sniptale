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
    viewportPresetId: null,
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
    const sendContentSurfaceState = vi.fn().mockResolvedValue(undefined);

    const publisher = createVideoRecordingRuntimeStatePublisher({
      applyBadgeState,
      countdownBadgeTimer,
      sendRuntimeMessage,
      sendContentSurfaceState,
    });

    const runtimeState = createRuntimeState();
    publisher.publishState(runtimeState);
    await Promise.resolve();

    expect(applyBadgeState).toHaveBeenCalledWith(runtimeState);
    expect(countdownBadgeTimer.sync).toHaveBeenCalledTimes(1);
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: VideoMessageType.RECORDING_STATE_SYNC,
      state: runtimeState,
    });
    expect(sendContentSurfaceState).toHaveBeenCalledWith(runtimeState);
  });

  it('serializes content surface lifecycle delivery', async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sendContentSurfaceState = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(undefined);
    const publisher = createVideoRecordingRuntimeStatePublisher({
      applyBadgeState: vi.fn(),
      countdownBadgeTimer: { sync: vi.fn() },
      sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
      sendContentSurfaceState,
    });
    const paused = { ...createRuntimeState(), status: VideoRecordingStatus.PAUSED };
    const idle = { ...createRuntimeState(), status: VideoRecordingStatus.IDLE };

    publisher.publishState(paused);
    publisher.publishState(idle);
    await Promise.resolve();
    expect(sendContentSurfaceState).toHaveBeenCalledTimes(1);
    releaseFirst();
    await first;
    await vi.waitFor(() => expect(sendContentSurfaceState).toHaveBeenNthCalledWith(2, idle));
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

  it('keeps runtime publication alive when the optional content surface disappears', async () => {
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);
    const sendContentSurfaceState = vi.fn().mockRejectedValue(new Error('tab navigated'));
    const publisher = createVideoRecordingRuntimeStatePublisher({
      applyBadgeState: vi.fn(),
      countdownBadgeTimer: { sync: vi.fn() },
      sendRuntimeMessage,
      sendContentSurfaceState,
    });

    publisher.publishState(createRuntimeState());
    await Promise.resolve();

    expect(sendRuntimeMessage).toHaveBeenCalledOnce();
    expect(sendContentSurfaceState).toHaveBeenCalledOnce();
  });
});
