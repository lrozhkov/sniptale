// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  loadMicrophoneDevices,
  requestMicrophonePermission,
  resolveMicrophoneDeviceId,
} from './index';

type MockMediaDevices = {
  enumerateDevices: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
};

function createDevice(label: string, deviceId = 'mic-1'): MediaDeviceInfo {
  return {
    deviceId,
    groupId: 'group-1',
    kind: 'audioinput',
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
    kind: 'audio',
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

function installMediaDevicesMock(mockMediaDevices: MockMediaDevices): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mockMediaDevices,
  });
}

function installPermissionsMock(state: PermissionState): void {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn().mockResolvedValue({ state }),
    },
  });
}

function resetPopupMicrophoneMocks() {
  vi.restoreAllMocks();
}

function verifiesKnownLabelPreservation() {
  const enumerateDevices = vi.fn().mockResolvedValue([createDevice('', 'mic-1')]);
  const getUserMedia = vi.fn();

  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  return loadMicrophoneDevices({
    knownDevices: [{ deviceId: 'mic-1', label: 'USB Mic' }],
  }).then((microphones) => {
    expect(microphones).toEqual([{ deviceId: 'mic-1', label: 'USB Mic' }]);
    expect(enumerateDevices).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
}

async function verifiesHydratedLabels() {
  const stop = vi.fn();
  const enumerateDevices = vi
    .fn()
    .mockResolvedValueOnce([createDevice('', 'mic-1')])
    .mockResolvedValueOnce([createDevice('USB Mic', 'mic-1')]);
  const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));

  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  const microphones = await loadMicrophoneDevices({ hydrateLabels: 'always' });

  expect(microphones).toEqual([{ deviceId: 'mic-1', label: 'USB Mic' }]);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(enumerateDevices).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalledOnce();
}

async function verifiesPassiveHydrationSkip() {
  const enumerateDevices = vi.fn().mockResolvedValue([createDevice('', 'mic-1')]);
  const getUserMedia = vi.fn();

  installMediaDevicesMock({ enumerateDevices, getUserMedia });
  installPermissionsMock('prompt');

  const microphones = await loadMicrophoneDevices({
    hydrateLabels: 'if-permission-granted',
  });

  expect(microphones).toEqual([
    {
      deviceId: 'mic-1',
      label: `${translate('popup.video.microphoneToggleLabel')} 1`,
    },
  ]);
  expect(getUserMedia).not.toHaveBeenCalled();
}

async function verifiesPermissionRequest() {
  const stop = vi.fn();
  const enumerateDevices = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));

  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  await requestMicrophonePermission('mic-2');

  expect(getUserMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.objectContaining({
        deviceId: { exact: 'mic-2' },
      }),
    })
  );
  expect(stop).toHaveBeenCalledOnce();
}

async function verifiesPermissionRequestWithoutDeviceSelection() {
  const stop = vi.fn();
  const enumerateDevices = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));

  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  await requestMicrophonePermission();

  expect(getUserMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.not.objectContaining({
        deviceId: expect.anything(),
      }),
    })
  );
  expect(stop).toHaveBeenCalledOnce();
}

async function verifiesPreferredDeviceFallback() {
  const stop = vi.fn();
  const enumerateDevices = vi
    .fn()
    .mockResolvedValueOnce([createDevice('', 'mic-1')])
    .mockResolvedValueOnce([createDevice('USB Mic', 'mic-1')]);
  const getUserMedia = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'))
    .mockResolvedValueOnce(createMockStream(stop));

  installMediaDevicesMock({ enumerateDevices, getUserMedia });

  const devices = await loadMicrophoneDevices({
    hydrateLabels: 'always',
    preferredDeviceId: 'missing-device',
  });

  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(devices).toEqual([{ deviceId: 'mic-1', label: 'USB Mic' }]);
  expect(stop).toHaveBeenCalledOnce();
}

function verifiesDeviceResolution() {
  expect(resolveMicrophoneDeviceId(null, [])).toBeNull();
  expect(
    resolveMicrophoneDeviceId('missing', [
      { deviceId: 'mic-1', label: 'Mic 1' },
      { deviceId: 'mic-2', label: 'Mic 2' },
    ])
  ).toBe('mic-1');
  expect(resolveMicrophoneDeviceId('mic-2', [{ deviceId: 'mic-2', label: 'Mic 2' }])).toBe('mic-2');
}

function runPopupMicrophoneSuite() {
  beforeEach(resetPopupMicrophoneMocks);
  afterEach(resetPopupMicrophoneMocks);

  it('preserves known microphone labels during passive refreshes', verifiesKnownLabelPreservation);
  it('hydrates microphone labels while a temporary stream is active', verifiesHydratedLabels);
  it(
    'avoids prompting on passive hydration when permission is not granted',
    verifiesPassiveHydrationSkip
  );
  it('requests microphone permission and stops the temporary stream', verifiesPermissionRequest);
  it(
    'omits device constraints when microphone permission is requested without a preferred device',
    verifiesPermissionRequestWithoutDeviceSelection
  );
  it(
    'falls back to a generic stream when the preferred microphone is unavailable',
    verifiesPreferredDeviceFallback
  );
  it('resolves microphone ids against the current device list', verifiesDeviceResolution);
}

describe('loadMicrophoneDevices', runPopupMicrophoneSuite);
