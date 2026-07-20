import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getVideoRecordingRuntimeState,
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from './index';
import { createVideoRecordingRuntimeStateService } from './service';
import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { browserAction } from '@sniptale/platform/browser/action';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/browser/action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/action')>()),
  browserAction: {
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  },
}));

function installChromeRuntimeMocks() {
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
}

function expectLastBadgeText(text: string) {
  expect(browserAction.setBadgeText).toHaveBeenLastCalledWith({ text });
}

function expectLastActionTitle(title: string) {
  expect(browserAction.setTitle).toHaveBeenLastCalledWith({ title });
}

function installRuntimeStateTestHarness() {
  beforeEach(() => {
    installChromeRuntimeMocks();
    resetVideoRecordingRuntimeState();
    vi.clearAllMocks();
  });
}

function installCountdownTimerHarness() {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

describe('video-session-state service ownership', () => {
  installRuntimeStateTestHarness();

  it('keeps runtime state isolated per service instance', () => {
    const firstService = createVideoRecordingRuntimeStateService();
    const secondService = createVideoRecordingRuntimeStateService();

    firstService.setState({
      status: VideoRecordingStatus.PREPARING,
      captureMode: null,
    });

    expect(firstService.getState().status).toBe(VideoRecordingStatus.PREPARING);
    expect(secondService.getState().status).toBe(VideoRecordingStatus.IDLE);
  });
});

describe('video-session-state active badge rendering', () => {
  installRuntimeStateTestHarness();
  installCountdownTimerHarness();

  it('publishes countdown state through the compatibility facade and keeps the badge ticking', async () => {
    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.COUNTDOWN,
      countdownEndsAt: 12_100,
    });

    expect(browserAction.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: DEFAULT_COLOR_ACCENT,
    });
    expectLastBadgeText('3');
    expectLastActionTitle(
      'background.runtime.actionCountdownPrefix 3 background.runtime.actionSecondsSuffix'
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expectLastBadgeText('2');
    expectLastActionTitle(
      'background.runtime.actionCountdownPrefix 2 background.runtime.actionSecondsSuffix'
    );
  });

  it('formats recording and paused durations across short, medium, and long badges', () => {
    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.RECORDING,
      duration: 125,
    });
    expectLastBadgeText('2:05');
    expectLastActionTitle('background.runtime.actionRecordingPrefix 02:05');

    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.PAUSED,
      duration: 901,
    });
    expectLastBadgeText('15m');
    expectLastActionTitle('background.runtime.actionPausedPrefix 15:01');

    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.RECORDING,
      duration: 3665,
    });
    expectLastBadgeText('1h');
    expectLastActionTitle('background.runtime.actionRecordingPrefix 1:01:05');
  });
});

describe('video-session-state pending badge rendering', () => {
  installRuntimeStateTestHarness();

  it('renders pending and idle badge states and swallows sync errors', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('popup closed'));

    expect(
      setVideoRecordingRuntimeState({
        status: VideoRecordingStatus.STOPPING,
      })
    ).toEqual(
      expect.objectContaining({
        status: VideoRecordingStatus.STOPPING,
      })
    );

    expectLastBadgeText('...');
    expectLastActionTitle('background.runtime.actionSavingRecording');

    const resetState = resetVideoRecordingRuntimeState();
    await Promise.resolve();

    expect(resetState.status).toBe(VideoRecordingStatus.IDLE);
    expectLastBadgeText('');
    expectLastActionTitle('background.runtime.actionOpenApp');
  });
});

describe('video-session-state compatibility facade', () => {
  installRuntimeStateTestHarness();

  it('preserves the compatibility facade for runtime state reads and sync payloads', () => {
    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.PREPARING,
      duration: 12,
    });

    expect(getVideoRecordingRuntimeState()).toEqual(
      expect.objectContaining({
        status: VideoRecordingStatus.PREPARING,
        duration: 12,
      })
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VideoMessageType.RECORDING_STATE_SYNC,
        state: expect.objectContaining({
          status: VideoRecordingStatus.PREPARING,
          duration: 12,
        }),
      })
    );
  });
});
