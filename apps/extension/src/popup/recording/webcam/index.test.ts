// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWebcamDevices, requestWebcamPermission, resolveWebcamDeviceId } from './index';

type MockMediaDevices = {
  enumerateDevices: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
};

function createDevice(label: string, deviceId = 'cam-1'): MediaDeviceInfo {
  return {
    deviceId,
    groupId: 'group-1',
    kind: 'videoinput',
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

function installMediaDevicesMock(mockMediaDevices: MockMediaDevices): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mockMediaDevices,
  });
}

function resetPopupWebcamMocks() {
  vi.restoreAllMocks();
}

describe('loadWebcamDevices', () => {
  beforeEach(resetPopupWebcamMocks);
  afterEach(resetPopupWebcamMocks);

  it('hydrates webcam labels while a temporary video-only stream is active', async () => {
    const stop = vi.fn();
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([createDevice('', 'cam-1')])
      .mockResolvedValueOnce([createDevice('USB Camera', 'cam-1')]);
    const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));

    installMediaDevicesMock({ enumerateDevices, getUserMedia });

    const webcams = await loadWebcamDevices({ hydrateLabels: 'always' });

    expect(webcams).toEqual([{ deviceId: 'cam-1', label: 'USB Camera' }]);
    expect(getUserMedia).toHaveBeenCalledWith({ video: {}, audio: false });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('requests webcam permission with exact device constraints and stops the stream', async () => {
    const stop = vi.fn();
    const enumerateDevices = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue(createMockStream(stop));

    installMediaDevicesMock({ enumerateDevices, getUserMedia });

    await requestWebcamPermission('cam-2');

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'cam-2' } },
      audio: false,
    });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('resolves stale webcam ids against the current device list', () => {
    expect(resolveWebcamDeviceId(null, [])).toBeNull();
    expect(resolveWebcamDeviceId('missing', [{ deviceId: 'cam-1', label: 'Camera 1' }])).toBe(
      'cam-1'
    );
    expect(resolveWebcamDeviceId('cam-2', [{ deviceId: 'cam-2', label: 'Camera 2' }])).toBe(
      'cam-2'
    );
  });
});
