import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  setBadgeText: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: {
    setBadgeBackgroundColor: mocks.setBadgeBackgroundColor,
    setBadgeText: mocks.setBadgeText,
    setTitle: mocks.setTitle,
  },
}));

import { applyDurationBadgeState } from './duration';
import { DEFAULT_COLOR_RECORDING, DEFAULT_COLOR_WARNING_STRONG } from './colors';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

function createState(duration: number): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.RECORDING,
    duration,
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

describe('applyDurationBadgeState', () => {
  it('renders recording durations', () => {
    applyDurationBadgeState(createState(125), DEFAULT_COLOR_RECORDING, 'recording-prefix');

    expect(mocks.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: DEFAULT_COLOR_RECORDING });
    expect(mocks.setBadgeText).toHaveBeenCalledWith({ text: '2:05' });
    expect(mocks.setTitle).toHaveBeenCalledWith({ title: 'recording-prefix 02:05' });
  });

  it('renders paused durations with the warning color', () => {
    applyDurationBadgeState(createState(901), DEFAULT_COLOR_WARNING_STRONG, 'paused-prefix');

    expect(mocks.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: DEFAULT_COLOR_WARNING_STRONG,
    });
    expect(mocks.setBadgeText).toHaveBeenCalledWith({ text: '15m' });
    expect(mocks.setTitle).toHaveBeenCalledWith({ title: 'paused-prefix 15:01' });
  });
});
