import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { createCountdownBadgeTimer } from './timer';

function createCountdownState(): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.COUNTDOWN,
    duration: 0,
    countdownEndsAt: 12_100,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
  };
}

function createIdleState(): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.IDLE,
    duration: 0,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
  };
}

describe('video-session-state countdown timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks while countdown is active and stops when the state changes', async () => {
    let state = createCountdownState();
    const applyBadgeState = vi.fn();
    const timer = createCountdownBadgeTimer(() => state, applyBadgeState);

    timer.sync();
    await vi.advanceTimersByTimeAsync(250);

    expect(applyBadgeState).toHaveBeenCalledTimes(1);
    expect(applyBadgeState).toHaveBeenLastCalledWith(state);

    state = {
      ...state,
      status: VideoRecordingStatus.RECORDING,
    };

    await vi.advanceTimersByTimeAsync(250);
    expect(applyBadgeState).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a timer when countdown metadata is missing', async () => {
    let state = createIdleState();
    const applyBadgeState = vi.fn();
    const timer = createCountdownBadgeTimer(() => state, applyBadgeState);

    timer.sync();
    await vi.advanceTimersByTimeAsync(500);
    expect(applyBadgeState).not.toHaveBeenCalled();

    state = {
      ...createCountdownState(),
      countdownEndsAt: null,
    };

    timer.sync();
    await vi.advanceTimersByTimeAsync(500);
    expect(applyBadgeState).not.toHaveBeenCalled();
  });
});
