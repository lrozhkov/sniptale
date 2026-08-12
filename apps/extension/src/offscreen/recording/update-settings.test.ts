import { beforeEach, expect, it, vi } from 'vitest';

const {
  hasActiveMultiSourceRecordingMock,
  setCameraSourceEnabledMock,
  setActiveSidecarWebcamEnabledMock,
  switchCameraSourceInputMock,
  updateMultiSourceRecordingSettingsMock,
} = vi.hoisted(() => ({
  hasActiveMultiSourceRecordingMock: vi.fn(),
  setCameraSourceEnabledMock: vi.fn(),
  setActiveSidecarWebcamEnabledMock: vi.fn(),
  switchCameraSourceInputMock: vi.fn(),
  updateMultiSourceRecordingSettingsMock: vi.fn(),
}));

vi.mock('./camera-source/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./camera-source/session')>()),
  setCameraSourceEnabled: setCameraSourceEnabledMock,
  switchCameraSourceInput: switchCameraSourceInputMock,
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
  switchCameraSourceInputMock.mockResolvedValue(undefined);
});

it('switches the stable camera input before reporting live success', async () => {
  await updateRecordingSettings({ webcamDeviceId: 'cam-2' });
  expect(switchCameraSourceInputMock).toHaveBeenCalledWith('cam-2');
});

it('switches the microphone through the active mixer and rejects unsupported sessions', async () => {
  const mixer = new AudioMixer();
  const switchMicrophone = vi.spyOn(mixer, 'switchMicrophone').mockResolvedValue(undefined);
  recordingContext.audioMixer = mixer;
  await updateRecordingSettings({
    echoCancellation: false,
    microphoneDeviceId: 'mic-2',
    microphoneGain: 1.5,
  });
  expect(switchMicrophone).toHaveBeenCalledWith({
    echoCancellation: false,
    microphoneDeviceId: 'mic-2',
    microphoneGain: 1.5,
  });
  recordingContext.audioMixer = null;
  await expect(updateRecordingSettings({ microphoneDeviceId: 'mic-3' })).rejects.toThrow(
    'unavailable'
  );
});

it('routes live settings to the active multi-source session', () => {
  hasActiveMultiSourceRecordingMock.mockReturnValue(true);
  const patch = { microphoneEnabled: false, webcamEnabled: true };

  updateRecordingSettings(patch);

  expect(updateMultiSourceRecordingSettingsMock).toHaveBeenCalledWith(patch);
  expect(setCameraSourceEnabledMock).toHaveBeenCalledWith(true);
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

it('acquires and connects a microphone enabled after recording start', async () => {
  const mixer = new AudioMixer();
  vi.spyOn(mixer, 'hasMicrophone').mockReturnValue(false);
  const addMicrophone = vi.spyOn(mixer, 'addMicrophone').mockResolvedValue(undefined);
  recordingContext.audioMixer = mixer;

  await updateRecordingSettings({
    microphoneDeviceId: 'mic-live',
    microphoneEnabled: true,
    echoCancellation: false,
  });

  expect(addMicrophone).toHaveBeenCalledWith({
    echoCancellation: false,
    microphoneDeviceId: 'mic-live',
  });
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
  expect(setCameraSourceEnabledMock).toHaveBeenCalledWith(false);
});
