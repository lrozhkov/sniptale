import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_PENDING,
  DEFAULT_COLOR_RECORDING,
  DEFAULT_COLOR_WARNING_STRONG,
} from '@sniptale/ui/default-colors/constants';
import { browserAction } from '@sniptale/platform/browser/action';
import {
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import { applyBadgeState } from './badge-state';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: {
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function createState(
  status: VideoRecordingStatus,
  overrides: Partial<VideoRecordingRuntimeState> = {}
) {
  return {
    status,
    duration: 0,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
    ...overrides,
  } as VideoRecordingRuntimeState;
}

describe('video-session-state countdown badge', () => {
  it('renders active countdown state', () => {
    applyBadgeState(createState(VideoRecordingStatus.COUNTDOWN, { countdownEndsAt: 12_100 }));

    expect(browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: DEFAULT_COLOR_ACCENT,
    });
    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: '3' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionCountdownPrefix 3 background.runtime.actionSecondsSuffix',
    });
  });

  it('shows REC when a countdown has already elapsed', () => {
    applyBadgeState(createState(VideoRecordingStatus.COUNTDOWN, { countdownEndsAt: 10_000 }));

    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: 'REC' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionCountdownPrefix 0 background.runtime.actionSecondsSuffix',
    });
  });
});

describe('video-session-state recording badge', () => {
  it('renders the recording badge state', () => {
    applyBadgeState(createState(VideoRecordingStatus.RECORDING, { duration: 125 }));

    expect(browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: DEFAULT_COLOR_RECORDING,
    });
    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: '2:05' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionRecordingPrefix 02:05',
    });
  });
});

describe('video-session-state paused, pending, and idle badges', () => {
  it('renders the paused badge state', () => {
    applyBadgeState(createState(VideoRecordingStatus.PAUSED, { duration: 901 }));

    expect(browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: DEFAULT_COLOR_WARNING_STRONG,
    });
    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: '15m' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionPausedPrefix 15:01',
    });
  });

  it('renders the pending badge state', () => {
    applyBadgeState(createState(VideoRecordingStatus.STOPPING));

    expect(browserAction.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: DEFAULT_COLOR_PENDING,
    });
    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: '...' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionSavingRecording',
    });
  });

  it('renders the idle badge state', () => {
    applyBadgeState(createState(VideoRecordingStatus.IDLE));

    expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    expect(browserAction.setTitle).toHaveBeenLastCalledWith({
      title: 'background.runtime.actionOpenApp',
    });
  });
});
