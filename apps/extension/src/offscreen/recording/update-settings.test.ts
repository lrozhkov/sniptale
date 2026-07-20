import { beforeEach, expect, it, vi } from 'vitest';

const {
  hasActiveMultiSourceRecordingMock,
  setActiveSidecarWebcamEnabledMock,
  updateMultiSourceRecordingSettingsMock,
} = vi.hoisted(() => ({
  hasActiveMultiSourceRecordingMock: vi.fn(),
  setActiveSidecarWebcamEnabledMock: vi.fn(),
  updateMultiSourceRecordingSettingsMock: vi.fn(),
}));

vi.mock('./multi-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./multi-source')>()),
  hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
  updateMultiSourceRecordingSettings: updateMultiSourceRecordingSettingsMock,
}));

vi.mock('./sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sidecar')>()),
  setActiveSidecarWebcamEnabled: setActiveSidecarWebcamEnabledMock,
}));

import { recordingContext } from './context';
import { AudioMixer } from './stream/audio-mixer';
import { updateRecordingSettings } from './update-settings';
import { createAudioStream } from './multi-source/media-stream.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  hasActiveMultiSourceRecordingMock.mockReturnValue(false);
  recordingContext.resetRecordingSession();
  recordingContext.audioMixer = null;
  recordingContext.videoStream = null;
});

it('routes live settings to the active multi-source session', () => {
  hasActiveMultiSourceRecordingMock.mockReturnValue(true);
  const patch = { microphoneEnabled: false, webcamEnabled: true };

  updateRecordingSettings(patch);

  expect(updateMultiSourceRecordingSettingsMock).toHaveBeenCalledWith(patch);
  expect(setActiveSidecarWebcamEnabledMock).not.toHaveBeenCalled();
});

it('toggles the single-source microphone through the audio mixer when present', () => {
  const mixer = new AudioMixer();
  const setMicrophoneEnabled = vi
    .spyOn(mixer, 'setMicrophoneEnabled')
    .mockImplementation(() => undefined);
  recordingContext.audioMixer = mixer;

  updateRecordingSettings({ microphoneEnabled: false });

  expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
});

it('falls back to audio tracks on the single-source recording stream', () => {
  const stream = createAudioStream();
  const [firstTrack] = stream.getAudioTracks();
  if (!firstTrack) {
    throw new Error('Expected an audio track in the recording fixture.');
  }
  recordingContext.videoStream = stream;

  updateRecordingSettings({ microphoneEnabled: false });

  expect(firstTrack.enabled).toBe(false);
});

it('toggles the active single-source sidecar webcam', () => {
  updateRecordingSettings({ webcamEnabled: false });

  expect(setActiveSidecarWebcamEnabledMock).toHaveBeenCalledWith(false);
});
