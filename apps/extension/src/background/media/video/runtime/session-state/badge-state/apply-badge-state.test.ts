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
import { DEFAULT_COLOR_RECORDING, DEFAULT_COLOR_WARNING_STRONG } from './colors';
import { translate } from '../../../../../../platform/i18n';
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
    viewportPresetId: null,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyBadgeState', () => {
  it('shows the microphone advisory in yellow and restores the recording badge after activity returns', () => {
    const state = {
      ...createState(VideoRecordingStatus.RECORDING),
      duration: 32,
      microphoneActivity: { status: 'ready' as const, level: 0, warning: true },
    };
    applyBadgeState(state);
    expect(mocks.applyDurationBadgeState).toHaveBeenLastCalledWith(
      state,
      DEFAULT_COLOR_WARNING_STRONG,
      translate('background.runtime.actionMicrophoneQuiet')
    );
    const recovered = {
      ...state,
      microphoneActivity: { ...state.microphoneActivity, level: 0.5, warning: false },
    };
    applyBadgeState(recovered);
    expect(mocks.applyDurationBadgeState).toHaveBeenLastCalledWith(
      recovered,
      DEFAULT_COLOR_RECORDING,
      translate('background.runtime.actionRecordingPrefix')
    );
  });

  it.each([
    VideoRecordingStatus.PREPARING,
    VideoRecordingStatus.COUNTDOWN,
    VideoRecordingStatus.STOPPING,
    VideoRecordingStatus.IDLE,
  ])('preserves the %s lifecycle badge when a stale microphone warning exists', (status) => {
    applyBadgeState({
      ...createState(status),
      microphoneActivity: { status: 'ready', level: 0, warning: true },
    });
    expect(mocks.applyDurationBadgeState).not.toHaveBeenCalled();
    if (status === VideoRecordingStatus.COUNTDOWN)
      expect(mocks.applyCountdownBadgeState).toHaveBeenCalledOnce();
    else if (status === VideoRecordingStatus.IDLE)
      expect(mocks.clearBadgeState).toHaveBeenCalledOnce();
    else expect(mocks.applyPendingBadgeState).toHaveBeenCalledOnce();
  });

  it('preserves the pause label over a microphone warning', () => {
    const state = {
      ...createState(VideoRecordingStatus.PAUSED),
      microphoneActivity: { status: 'ready' as const, level: 0, warning: true },
    };
    applyBadgeState(state);
    expect(mocks.applyDurationBadgeState).toHaveBeenCalledExactlyOnceWith(
      state,
      DEFAULT_COLOR_WARNING_STRONG,
      translate('background.runtime.actionPausedPrefix')
    );
  });

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
