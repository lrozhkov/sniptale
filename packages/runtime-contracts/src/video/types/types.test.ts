import { expect, it } from 'vitest';

import {
  createVideoRecordingLiveMediaState,
  normalizeVideoSourceCount,
  resolveVideoRecordingAudioMode,
  updateVideoRecordingLiveMediaState,
  VideoRecordingAudioMode,
  VideoQuality,
} from './types';

it('clamps video source counts and derives the recording audio policy', () => {
  expect(normalizeVideoSourceCount(undefined)).toBe(1);
  expect(normalizeVideoSourceCount(0)).toBe(1);
  expect(normalizeVideoSourceCount(2.9)).toBe(2);
  expect(normalizeVideoSourceCount(99)).toBe(3);
  expect(resolveVideoRecordingAudioMode({ sourceCount: 1 })).toBe(VideoRecordingAudioMode.EMBEDDED);
  expect(resolveVideoRecordingAudioMode({ sourceCount: 2 })).toBe(
    VideoRecordingAudioMode.SEPARATE_MIC_TRACK
  );
});

it('creates and updates live media state from recording settings', () => {
  const liveMedia = createVideoRecordingLiveMediaState({
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
  });

  expect(liveMedia).toEqual(
    expect.objectContaining({
      microphoneEnabled: true,
      microphoneSelected: true,
      webcamEnabled: true,
      webcamSelected: true,
    })
  );
  expect(updateVideoRecordingLiveMediaState(liveMedia, { microphoneEnabled: false })).toEqual(
    expect.objectContaining({ microphoneEnabled: false, webcamEnabled: true })
  );
  expect(updateVideoRecordingLiveMediaState(null, { webcamEnabled: false })).toBeNull();
});
