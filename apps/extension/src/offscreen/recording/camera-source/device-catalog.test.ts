import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listVideoRecordingMediaDevices } from './device-catalog';

beforeEach(() => {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
  });
});

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

it('does not expose unnamed placeholders or request access from the hidden document', async () => {
  vi.mocked(navigator.permissions.query).mockResolvedValue({ state: 'prompt' } as PermissionStatus);
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

  await expect(listVideoRecordingMediaDevices()).resolves.toEqual([]);
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
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

  await expect(listVideoRecordingMediaDevices('audioinput')).resolves.toEqual([]);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
});
