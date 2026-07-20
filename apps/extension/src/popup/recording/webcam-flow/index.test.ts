import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { refreshWebcamDevices, toggleWebcam } from './index';

const { loadWebcamDevicesMock, resolveWebcamDeviceIdMock } = vi.hoisted(() => ({
  loadWebcamDevicesMock: vi.fn(),
  resolveWebcamDeviceIdMock: vi.fn((deviceId: string | null) => deviceId),
}));

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../webcam', (_importOriginal) => ({
  loadWebcamDevices: loadWebcamDevicesMock,
  resolveWebcamDeviceId: resolveWebcamDeviceIdMock,
}));

const defaultSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: 'cam-1',
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
};

function setupPopupWebcamFlowMocks() {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWebcamDevicesMock.mockRejectedValue(new Error('webcam load failed'));
    resolveWebcamDeviceIdMock.mockImplementation((deviceId: string | null) => deviceId);
  });
}

describe('toggleWebcam enable flow', () => {
  setupPopupWebcamFlowMocks();

  it('hydrates labels and resolves stale selected cameras when enabling webcam capture', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const devices = [{ deviceId: 'cam-2', label: 'USB Camera' }];
    const refreshWebcams = vi.fn().mockResolvedValue(devices);
    resolveWebcamDeviceIdMock.mockReturnValue('cam-2');

    await toggleWebcam({
      videoSettings: { ...defaultSettings, webcamDeviceId: 'missing-camera' },
      setVideoSettings,
      setStartError,
      refreshWebcams,
    });

    expect(refreshWebcams).toHaveBeenCalledWith({
      hydrateLabels: 'always',
      preferredDeviceId: 'missing-camera',
    });
    const applySettings = setVideoSettings.mock.calls[0]?.[0] as typeof setVideoSettings;
    expect(applySettings({ ...defaultSettings, webcamDeviceId: 'missing-camera' })).toEqual(
      expect.objectContaining({ webcamEnabled: true, webcamDeviceId: 'cam-2' })
    );
  });
});

describe('toggleWebcam disable and error flow', () => {
  setupPopupWebcamFlowMocks();

  it('disables webcam capture while preserving the selected device id', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const refreshWebcams = vi.fn();

    await toggleWebcam({
      videoSettings: {
        ...defaultSettings,
        webcamEnabled: true,
        webcamDeviceId: 'cam-1',
      },
      setVideoSettings,
      setStartError,
      refreshWebcams,
    });

    const applySettings = setVideoSettings.mock.calls[0]?.[0] as typeof setVideoSettings;
    expect(
      applySettings({ ...defaultSettings, webcamEnabled: true, webcamDeviceId: 'cam-1' })
    ).toEqual(expect.objectContaining({ webcamEnabled: false, webcamDeviceId: 'cam-1' }));
    expect(setStartError).not.toHaveBeenCalled();
    expect(refreshWebcams).not.toHaveBeenCalled();
  });

  it('surfaces empty and denied-access webcam failures without enabling webcam capture', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();

    await toggleWebcam({
      videoSettings: defaultSettings,
      setVideoSettings,
      setStartError,
      refreshWebcams: vi.fn().mockResolvedValue([]),
    });
    await toggleWebcam({
      videoSettings: defaultSettings,
      setVideoSettings,
      setStartError,
      refreshWebcams: vi.fn().mockRejectedValue(new Error('permission denied')),
    });

    expect(setStartError).toHaveBeenCalledWith('popup.video.noWebcamsError');
    expect(setStartError).toHaveBeenCalledWith('permission denied');
    expect(setVideoSettings).not.toHaveBeenCalled();
  });
});

describe('refreshWebcamDevices', () => {
  setupPopupWebcamFlowMocks();

  it('stores refreshed webcam devices and clears them on refresh failure', async () => {
    const setIsLoading = vi.fn();
    const setWebcamDevices = vi.fn();
    const devices = [{ deviceId: 'cam-2', label: 'Conference Camera' }];
    loadWebcamDevicesMock.mockResolvedValueOnce(devices);

    await expect(
      refreshWebcamDevices(setIsLoading, setWebcamDevices, [], {
        preferredDeviceId: 'cam-2',
      })
    ).resolves.toEqual(devices);
    await expect(refreshWebcamDevices(setIsLoading, setWebcamDevices, [])).resolves.toEqual([]);

    expect(loadWebcamDevicesMock).toHaveBeenNthCalledWith(1, {
      knownDevices: [],
      preferredDeviceId: 'cam-2',
    });
    expect(setWebcamDevices).toHaveBeenNthCalledWith(1, devices);
    expect(setWebcamDevices).toHaveBeenLastCalledWith([]);
  });
});
