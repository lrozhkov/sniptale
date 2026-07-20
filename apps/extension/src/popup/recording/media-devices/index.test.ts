// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import {
  loadPopupMediaDevices,
  requestPopupMediaDevicePermission,
  resolvePopupMediaDeviceId,
  type PopupMediaDeviceConfig,
} from './index';

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

type MockMediaDevices = {
  enumerateDevices?: ReturnType<typeof vi.fn>;
  getUserMedia?: ReturnType<typeof vi.fn>;
};

const cameraConfig: PopupMediaDeviceConfig = {
  kind: 'videoinput',
  permissionName: 'camera',
  fallbackLabelKey: 'popup.video.webcamToggleLabel',
  createConstraints: (deviceId?: string | null) => ({
    video: deviceId ? { deviceId: { exact: deviceId } } : {},
    audio: false,
  }),
};

function createDevice(kind: MediaDeviceKind, label: string, deviceId: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: 'group-1',
    kind,
    label,
    toJSON() {
      return this;
    },
  } as MediaDeviceInfo;
}

function createMockTrack(stop = vi.fn()): MediaStreamTrack {
  return Object.assign(new EventTarget() as MediaStreamTrack, {
    applyConstraints: vi.fn(),
    clone: vi.fn(),
    contentHint: '',
    enabled: true,
    getCapabilities: vi.fn(),
    getConstraints: vi.fn(),
    getSettings: vi.fn(),
    id: 'track-1',
    kind: 'video',
    label: 'track',
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
    readyState: 'live',
    stop,
  });
}

function createMockStream(stop = vi.fn()): MediaStream {
  return {
    getTracks: () => [createMockTrack(stop)],
  } as MediaStream;
}

function installMediaDevicesMock(mockMediaDevices?: MockMediaDevices): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mockMediaDevices,
  });
}

function installPermissionsMock(query: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('returns no devices when browser media enumeration is unavailable', async () => {
  installMediaDevicesMock(undefined);

  await expect(loadPopupMediaDevices(cameraConfig)).resolves.toEqual([]);
});

it('preserves known labels without opening a permission stream', async () => {
  const enumerateDevices = vi
    .fn()
    .mockResolvedValue([
      createDevice('audioinput', 'USB Mic', 'mic-1'),
      createDevice('videoinput', '', 'cam-1'),
    ]);
  const getUserMedia = vi.fn();
  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  await expect(
    loadPopupMediaDevices(cameraConfig, {
      knownDevices: [{ deviceId: 'cam-1', label: 'USB Camera' }],
    })
  ).resolves.toEqual([{ deviceId: 'cam-1', label: 'USB Camera' }]);
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('hydrates labels only after a granted passive permission check', async () => {
  const stop = vi.fn();
  const enumerateDevices = vi
    .fn()
    .mockResolvedValueOnce([createDevice('videoinput', '', 'cam-1')])
    .mockResolvedValueOnce([createDevice('videoinput', 'Desk Camera', 'cam-1')]);
  const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));
  installMediaDevicesMock({ enumerateDevices, getUserMedia });
  installPermissionsMock(vi.fn().mockResolvedValue({ state: 'granted' }));

  await expect(
    loadPopupMediaDevices(cameraConfig, { hydrateLabels: 'if-permission-granted' })
  ).resolves.toEqual([{ deviceId: 'cam-1', label: 'Desk Camera' }]);
  expect(getUserMedia).toHaveBeenCalledWith({ video: {}, audio: false });
  expect(stop).toHaveBeenCalledOnce();
});

it('keeps fallback labels when passive permission lookup is unavailable', async () => {
  const enumerateDevices = vi.fn().mockResolvedValue([createDevice('videoinput', '', 'cam-1')]);
  const getUserMedia = vi.fn();
  installMediaDevicesMock({ enumerateDevices, getUserMedia });
  installPermissionsMock(vi.fn().mockRejectedValue(new Error('unsupported')));

  await expect(
    loadPopupMediaDevices(cameraConfig, { hydrateLabels: 'if-permission-granted' })
  ).resolves.toEqual([{ deviceId: 'cam-1', label: 'popup.video.webcamToggleLabel 1' }]);
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('falls back from stale preferred devices during label hydration', async () => {
  const stop = vi.fn();
  const enumerateDevices = vi
    .fn()
    .mockResolvedValueOnce([createDevice('videoinput', '', 'cam-1')])
    .mockResolvedValueOnce([createDevice('videoinput', 'Desk Camera', 'cam-1')]);
  const getUserMedia = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'))
    .mockResolvedValueOnce(createMockStream(stop));
  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  await expect(
    loadPopupMediaDevices(cameraConfig, {
      hydrateLabels: 'always',
      preferredDeviceId: 'missing-camera',
    })
  ).resolves.toEqual([{ deviceId: 'cam-1', label: 'Desk Camera' }]);
  expect(getUserMedia).toHaveBeenNthCalledWith(1, {
    video: { deviceId: { exact: 'missing-camera' } },
    audio: false,
  });
  expect(getUserMedia).toHaveBeenNthCalledWith(2, { video: {}, audio: false });
});

it('keeps enumerated devices when hydration access fails', async () => {
  const enumerateDevices = vi.fn().mockResolvedValue([createDevice('videoinput', '', 'cam-1')]);
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  await expect(loadPopupMediaDevices(cameraConfig, { hydrateLabels: 'always' })).resolves.toEqual([
    { deviceId: 'cam-1', label: 'popup.video.webcamToggleLabel 1' },
  ]);
});

it('requests selected media and stops temporary tracks', async () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));
  installMediaDevicesMock({ getUserMedia });

  await requestPopupMediaDevicePermission(cameraConfig, 'cam-2');

  expect(getUserMedia).toHaveBeenCalledWith({
    video: { deviceId: { exact: 'cam-2' } },
    audio: false,
  });
  expect(stop).toHaveBeenCalledOnce();
});

it('keeps current devices or falls back to the first available device', () => {
  expect(resolvePopupMediaDeviceId(null, [])).toBeNull();
  expect(resolvePopupMediaDeviceId('missing', [{ deviceId: 'cam-1', label: 'Camera' }])).toBe(
    'cam-1'
  );
  expect(resolvePopupMediaDeviceId('cam-2', [{ deviceId: 'cam-2', label: 'Camera' }])).toBe(
    'cam-2'
  );
});
