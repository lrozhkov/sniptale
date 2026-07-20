import { expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../copy', (_importOriginal) => ({
  describeCaptureSource: vi.fn(() => 'Example source'),
  formatDuration: vi.fn((value: number) => `duration:${value}`),
  getCaptureModeLabels: vi.fn(() => ({
    SCREEN: 'Screen',
    TAB: 'Tab',
    TAB_CROP: 'Area',
    VIEWPORT_EMULATION: 'Preset',
  })),
  getViewportPresetLabel: vi.fn(() => 'Preset 1280x720'),
}));

import {
  CaptureMode,
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import { getVideoActiveViewModel } from './view-model';

function createRecordingState(
  overrides: Partial<VideoRecordingRuntimeState> = {}
): VideoRecordingRuntimeState {
  return {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 12,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPreset: null,
    ...overrides,
  };
}

it('derives active-page labels and controls for the preparing state', () => {
  const viewModel = getVideoActiveViewModel(
    createRecordingState({
      error: 'Failed',
      status: VideoRecordingStatus.PREPARING,
    }),
    0
  );

  expect(viewModel).toEqual(
    expect.objectContaining({
      canControl: false,
      isBusy: true,
      isPaused: false,
      modeLabel: 'Tab',
      sourceLabel: 'Example source',
      value: '...',
      viewportPresetLabel: 'Preset 1280x720',
    })
  );
});

it('uses the countdown value and pause state while counting down', () => {
  const viewModel = getVideoActiveViewModel(
    createRecordingState({
      captureMode: CaptureMode.SCREEN,
      status: VideoRecordingStatus.COUNTDOWN,
    }),
    2
  );

  expect(viewModel.value).toBe('2');
  expect(viewModel.canControl).toBe(false);
  expect(viewModel.isBusy).toBe(true);
});
