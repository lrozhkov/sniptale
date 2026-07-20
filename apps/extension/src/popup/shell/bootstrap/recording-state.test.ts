import { describe, expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  loadRecordingStateResponseWithFallback,
  resolvePopupBootstrapRecordingState,
} from './recording-state';

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../navigation/actions', (_importOriginal) => ({
  IDLE_RECORDING_STATE: {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.IDLE,
    viewportPreset: null,
  },
}));

function createRecordingState(status = VideoRecordingStatus.RECORDING) {
  return {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 12,
    error: null,
    status,
    viewportPreset: null,
  };
}

describe('popup bootstrap recording-state resolution', () => {
  it('preserves degraded recording state instead of collapsing it to idle', () => {
    const result = resolvePopupBootstrapRecordingState({
      recordingHealth: 'degraded',
      state: {
        ...createRecordingState(),
        error: 'Microphone unavailable',
      },
      success: true,
    });

    expect(result.recordingState.status).toBe(VideoRecordingStatus.RECORDING);
    expect(result.recordingState.error).toBe('Microphone unavailable');
    expect(result.recordingStatusError).toBe('Microphone unavailable');
  });

  it('maps failed recording responses to idle with an explicit error', () => {
    const result = resolvePopupBootstrapRecordingState({
      recordingHealth: 'failed',
      success: false,
    });

    expect(result.recordingState.status).toBe(VideoRecordingStatus.IDLE);
    expect(result.recordingStatusError).toBe('background.runtime.recordingUnavailable');
  });
});

describe('popup bootstrap recording-state fallback loading', () => {
  it('falls back to a failed recording bootstrap contract when runtime loading rejects', async () => {
    const onFailure = vi.fn();

    const response = await loadRecordingStateResponseWithFallback(
      {
        sendRuntimeMessage: vi.fn().mockRejectedValue(new Error('transport failed')),
        sendTabMessage: vi.fn(),
      },
      onFailure
    );

    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
    expect(response).toEqual({
      error: 'background.runtime.recordingUnavailable',
      recordingHealth: 'failed',
      success: false,
    });
  });
});
