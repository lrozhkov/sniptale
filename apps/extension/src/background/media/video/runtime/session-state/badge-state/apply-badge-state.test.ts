import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCountdownBadgeState: vi.fn(),
  applyDurationBadgeState: vi.fn(),
  applyPendingBadgeState: vi.fn(),
  clearBadgeState: vi.fn(),
}));

vi.mock('./countdown', () => ({
  applyCountdownBadgeState: mocks.applyCountdownBadgeState,
}));

vi.mock('./duration', () => ({
  applyDurationBadgeState: mocks.applyDurationBadgeState,
}));

vi.mock('./pending', () => ({
  applyPendingBadgeState: mocks.applyPendingBadgeState,
}));

vi.mock('./clear', () => ({
  clearBadgeState: mocks.clearBadgeState,
}));

import { applyBadgeState } from './apply-badge-state';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

function createState(status: VideoRecordingStatus): VideoRecordingRuntimeState {
  return {
    status,
    duration: 0,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyBadgeState', () => {
  it('dispatches countdown, duration, pending, and clear branches', () => {
    applyBadgeState(createState(VideoRecordingStatus.COUNTDOWN));
    applyBadgeState(createState(VideoRecordingStatus.RECORDING));
    applyBadgeState(createState(VideoRecordingStatus.PREPARING));
    applyBadgeState(createState(VideoRecordingStatus.STOPPING));
    applyBadgeState(createState(VideoRecordingStatus.IDLE));

    expect(mocks.applyCountdownBadgeState).toHaveBeenCalledTimes(1);
    expect(mocks.applyDurationBadgeState).toHaveBeenCalledTimes(1);
    expect(mocks.applyPendingBadgeState).toHaveBeenCalledTimes(2);
    expect(mocks.clearBadgeState).toHaveBeenCalledTimes(1);
  });

  it('clears the badge for impossible runtime statuses too', () => {
    applyBadgeState({ ...createState(VideoRecordingStatus.IDLE), status: 'UNKNOWN' as never });

    expect(mocks.clearBadgeState).toHaveBeenCalledTimes(1);
  });
});
