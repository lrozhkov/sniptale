import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { applyCountdownBadgeState } from './countdown';
import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

function createState(countdownEndsAt: number | null): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.COUNTDOWN,
    duration: 0,
    countdownEndsAt,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders the remaining countdown time', () => {
  applyCountdownBadgeState(createState(12_100));

  expect(mocks.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: DEFAULT_COLOR_ACCENT });
  expect(mocks.setBadgeText).toHaveBeenCalledWith({ text: '3' });
  expect(mocks.setTitle).toHaveBeenCalledWith({
    title: 'background.runtime.actionCountdownPrefix 3 background.runtime.actionSecondsSuffix',
  });
});

it('shows REC after the countdown elapses', () => {
  applyCountdownBadgeState(createState(10_000));

  expect(mocks.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
  expect(mocks.setTitle).toHaveBeenCalledWith({
    title: 'background.runtime.actionCountdownPrefix 0 background.runtime.actionSecondsSuffix',
  });
});
