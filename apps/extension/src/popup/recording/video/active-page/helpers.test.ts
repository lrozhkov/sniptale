import { describe, expect, it } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  getVideoActiveIdleLabel,
  getVideoActiveIndicatorClassName,
  getVideoActivePauseResumeLabel,
  getVideoActiveStopLabel,
  getVideoActiveValueClassName,
} from './helpers';

describe('video active page helpers: classes', () => {
  it('uses the danger indicator while recording', () => {
    expect(getVideoActiveIndicatorClassName(VideoRecordingStatus.RECORDING)).toContain(
      'var(--sniptale-color-danger)'
    );
    expect(getVideoActiveIndicatorClassName(VideoRecordingStatus.PAUSED)).toContain(
      'var(--sniptale-color-text-dim)'
    );
  });

  it('switches the main value styling for recording mode', () => {
    expect(getVideoActiveValueClassName(VideoRecordingStatus.RECORDING)).toContain(
      'var(--sniptale-color-danger)'
    );
    expect(getVideoActiveValueClassName(VideoRecordingStatus.PAUSED)).toContain(
      'var(--sniptale-color-text-primary-strong)'
    );
  });
});

describe('video active page helpers: labels', () => {
  it('returns the pause and resume labels from the paused state', () => {
    expect(getVideoActivePauseResumeLabel(true)).not.toBe(getVideoActivePauseResumeLabel(false));
  });

  it('switches the idle label for busy and ready states', () => {
    expect(getVideoActiveIdleLabel(true)).not.toBe(getVideoActiveIdleLabel(false));
  });

  it('prioritizes the stopping label before control availability', () => {
    expect(
      getVideoActiveStopLabel({
        canControl: true,
        recordingState: {
          status: VideoRecordingStatus.STOPPING,
          duration: 0,
          error: null,
          captureMode: null,
          captureSource: null,
          countdownEndsAt: null,
          viewportPreset: null,
        },
      })
    ).not.toBe(
      getVideoActiveStopLabel({
        canControl: false,
        recordingState: {
          status: VideoRecordingStatus.IDLE,
          duration: 0,
          error: null,
          captureMode: null,
          captureSource: null,
          countdownEndsAt: null,
          viewportPreset: null,
        },
      })
    );
  });
});
