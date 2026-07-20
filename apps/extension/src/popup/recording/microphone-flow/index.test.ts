import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { refreshMicrophoneDevices, toggleMicrophone } from './index';

const { loadMicrophoneDevicesMock } = vi.hoisted(() => ({
  loadMicrophoneDevicesMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../microphone', (_importOriginal) => ({
  loadMicrophoneDevices: loadMicrophoneDevicesMock,
  resolveMicrophoneDeviceId: (deviceId: string | null) => deviceId,
}));

const defaultSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: 'mic-1',
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
};

function setupPopupMicrophoneFlowMocks() {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMicrophoneDevicesMock.mockRejectedValue(new Error('microphone load failed'));
  });
}

describe('toggleMicrophone enable flow', () => {
  setupPopupMicrophoneFlowMocks();

  it('hydrates labels through an explicit microphone refresh when enabling audio input', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const refreshMicrophones = vi.fn().mockResolvedValue([{ deviceId: 'mic-1', label: 'USB Mic' }]);

    await toggleMicrophone({
      videoSettings: defaultSettings,
      setVideoSettings,
      setStartError,
      refreshMicrophones,
    });

    expect(refreshMicrophones).toHaveBeenCalledWith({
      hydrateLabels: 'always',
      preferredDeviceId: 'mic-1',
    });
    expect(setVideoSettings).toHaveBeenCalledOnce();
  });
});

describe('toggleMicrophone disable and error flow', () => {
  setupPopupMicrophoneFlowMocks();

  it('disables microphone input immediately when it is already enabled', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const refreshMicrophones = vi.fn();

    await toggleMicrophone({
      videoSettings: {
        ...defaultSettings,
        microphoneEnabled: true,
      },
      setVideoSettings,
      setStartError,
      refreshMicrophones,
    });

    expect(setVideoSettings).toHaveBeenCalledOnce();
    expect(setStartError).not.toHaveBeenCalled();
    expect(refreshMicrophones).not.toHaveBeenCalled();
  });

  it('surfaces an error when microphone refresh returns no devices', async () => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const refreshMicrophones = vi.fn().mockResolvedValue([]);

    await toggleMicrophone({
      videoSettings: defaultSettings,
      setVideoSettings,
      setStartError,
      refreshMicrophones,
    });

    expect(setStartError).toHaveBeenLastCalledWith('popup.video.noMicrophonesError');
    expect(setVideoSettings).not.toHaveBeenCalled();
  });
});

describe('refreshMicrophoneDevices', () => {
  setupPopupMicrophoneFlowMocks();

  it('clears microphone devices and resolves an empty list when refresh fails', async () => {
    const setIsLoading = vi.fn();
    const setMicrophoneDevices = vi.fn();

    await expect(refreshMicrophoneDevices(setIsLoading, setMicrophoneDevices, [])).resolves.toEqual(
      []
    );

    expect(setIsLoading).toHaveBeenNthCalledWith(1, true);
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
    expect(setMicrophoneDevices).toHaveBeenCalledWith([]);
  });

  it('stores refreshed devices when microphone loading succeeds', async () => {
    const devices = [{ deviceId: 'mic-2', label: 'Conference Mic' }];
    const setIsLoading = vi.fn();
    const setMicrophoneDevices = vi.fn();
    loadMicrophoneDevicesMock.mockResolvedValue(devices);

    await expect(
      refreshMicrophoneDevices(setIsLoading, setMicrophoneDevices, [], {
        preferredDeviceId: 'mic-2',
      })
    ).resolves.toEqual(devices);

    expect(loadMicrophoneDevicesMock).toHaveBeenCalledWith({
      knownDevices: [],
      preferredDeviceId: 'mic-2',
    });
    expect(setMicrophoneDevices).toHaveBeenCalledWith(devices);
  });
});
