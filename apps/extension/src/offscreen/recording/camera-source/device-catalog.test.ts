import { afterEach, expect, it, vi } from 'vitest';
import { listVideoRecordingMediaDevices } from './device-catalog';

afterEach(() => {
  vi.restoreAllMocks();
});

it('hydrates extension-owned media labels and stops temporary permission streams', async () => {
  const stopAudio = vi.fn();
  const stopVideo = vi.fn();
  const enumerateDevices = vi
    .fn()
    .mockResolvedValueOnce([
      { deviceId: 'mic-1', kind: 'audioinput', label: '' },
      { deviceId: 'cam-1', kind: 'videoinput', label: '' },
    ])
    .mockResolvedValueOnce([
      { deviceId: 'mic-1', kind: 'audioinput', label: 'Studio microphone' },
      { deviceId: 'cam-1', kind: 'videoinput', label: 'Desk camera' },
      { deviceId: 'speaker-1', kind: 'audiooutput', label: 'Speakers' },
    ]);
  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => ({
    getTracks: () => [{ stop: constraints.audio ? stopAudio : stopVideo }],
  }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices, getUserMedia },
  });

  await expect(listVideoRecordingMediaDevices()).resolves.toEqual([
    { deviceId: 'mic-1', kind: 'audioinput', label: 'Studio microphone' },
    { deviceId: 'cam-1', kind: 'videoinput', label: 'Desk camera' },
  ]);
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: true });
  expect(stopAudio).toHaveBeenCalledOnce();
  expect(stopVideo).toHaveBeenCalledOnce();
});

it('preserves real device ids when permission is declined and leaves localization to the UI', async () => {
  const enumerateDevices = vi
    .fn()
    .mockResolvedValue([{ deviceId: 'mic-1', kind: 'audioinput', label: '' }]);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices,
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    },
  });

  await expect(listVideoRecordingMediaDevices()).resolves.toEqual([
    { deviceId: 'mic-1', kind: 'audioinput', label: '' },
  ]);
});

it('hydrates only the device kind requested by the opened split menu', async () => {
  const enumerateDevices = vi.fn().mockResolvedValue([
    { deviceId: 'mic-1', kind: 'audioinput', label: '' },
    { deviceId: 'cam-1', kind: 'videoinput', label: '' },
  ]);
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices, getUserMedia },
  });

  await expect(listVideoRecordingMediaDevices('audioinput')).resolves.toEqual([
    { deviceId: 'mic-1', kind: 'audioinput', label: '' },
  ]);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
});
