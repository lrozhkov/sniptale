import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireMicrophoneInput,
  listMicrophoneInputDevices,
  observeMicrophoneLevel,
  readMicrophoneAccessState,
  requestMicrophoneAccess,
  subscribeToMicrophoneAccessChanges,
  subscribeToMicrophoneDeviceChanges,
} from './user-media';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createMediaStreamTrackFixture(kind: 'audio' | 'video'): MediaStreamTrack {
  return Object.assign(new EventTarget(), {
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    clone: vi.fn(),
    contentHint: '',
    enabled: true,
    getCapabilities: vi.fn().mockReturnValue({}),
    getConstraints: vi.fn().mockReturnValue({}),
    getSettings: vi.fn().mockReturnValue({}),
    id: `${kind}-track`,
    kind,
    label: `${kind} track`,
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
    readyState: 'live' as const,
    stop: vi.fn(),
  });
}

describe('user media adapter', () => {
  it('stops granted microphone tracks immediately', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
      },
    });

    await expect(requestMicrophoneAccess()).resolves.toBe('granted');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('requests and acquires the exact selected microphone track', async () => {
    const selectedTrack = createMediaStreamTrackFixture('audio');
    const otherTrack = createMediaStreamTrackFixture('video');
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [selectedTrack],
      getTracks: () => [selectedTrack, otherTrack],
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const acquisition = await acquireMicrophoneInput('microphone-2');
    expect(acquisition.track).toBe(selectedTrack);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'microphone-2' } },
    });
    acquisition.release();
    acquisition.release();
    expect(selectedTrack.stop).toHaveBeenCalledOnce();
    expect(otherTrack.stop).toHaveBeenCalledOnce();
  });

  it('enumerates audio inputs without exposing duplicate device ids', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: 'microphone-1', kind: 'audioinput', label: 'Desk microphone' },
          { deviceId: 'microphone-1', kind: 'audioinput', label: 'Duplicate' },
          { deviceId: 'camera-1', kind: 'videoinput', label: 'Camera' },
        ]),
      },
    });
    await expect(listMicrophoneInputDevices()).resolves.toEqual([
      { deviceId: 'microphone-1', label: 'Desk microphone' },
    ]);
  });

  it('subscribes to microphone device changes', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { addEventListener, removeEventListener } });
    const listener = vi.fn();
    const unsubscribe = subscribeToMicrophoneDeviceChanges(listener);
    expect(addEventListener).toHaveBeenCalledWith('devicechange', listener);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', listener);
  });

  it('samples the live microphone level at 10 Hz without retaining audio', () => {
    vi.useFakeTimers();
    const disconnectSource = vi.fn();
    const disconnectAnalyser = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const analyser = {
      connect: vi.fn(),
      disconnect: disconnectAnalyser,
      fftSize: 0,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(160),
      smoothingTimeConstant: 0,
    };
    const source = { connect: vi.fn(), disconnect: disconnectSource };
    vi.stubGlobal(
      'AudioContext',
      class {
        close = close;
        createAnalyser = () => analyser;
        createMediaStreamSource = () => source;
        resume = vi.fn().mockResolvedValue(undefined);
      }
    );
    vi.stubGlobal('MediaStream', class {});
    const listener = vi.fn();
    const monitor = observeMicrophoneLevel({} as MediaStreamTrack, listener);
    vi.advanceTimersByTime(99);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledWith({
      level: expect.any(Number),
      peaks: expect.arrayContaining([expect.any(Number)]),
    });
    expect(listener.mock.calls[0]?.[0].level).toBeGreaterThan(0);
    expect(listener.mock.calls[0]?.[0].peaks).toHaveLength(16);
    vi.advanceTimersByTime(29_900);
    expect(listener).toHaveBeenCalledTimes(300);
    monitor.dispose();
    vi.advanceTimersByTime(2_000);
    expect(listener).toHaveBeenCalledTimes(300);
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['NotReadableError', 'device-busy'],
    ['SecurityError', 'unavailable'],
  ] as const)('normalizes %s without exposing the browser error', async (name, expected) => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('sensitive detail', name)),
      },
    });
    await expect(requestMicrophoneAccess()).resolves.toBe(expected);
  });

  it('normalizes missing media APIs, aborts, and unknown failures', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestMicrophoneAccess()).resolves.toBe('unavailable');

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('busy', 'AbortError')),
      },
    });
    await expect(requestMicrophoneAccess()).resolves.toBe('device-busy');

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('private detail')) },
    });
    await expect(requestMicrophoneAccess()).resolves.toBe('unknown');
  });

  it('reads and subscribes to permission changes', async () => {
    let listener: (() => void) | undefined;
    const status = {
      state: 'prompt' as PermissionState,
      addEventListener: vi.fn((_type: string, nextListener: () => void) => {
        listener = nextListener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue(status) },
    });

    await expect(readMicrophoneAccessState()).resolves.toBe('prompt');
    const changes = vi.fn();
    const unsubscribe = await subscribeToMicrophoneAccessChanges(changes);
    status.state = 'denied';
    listener?.();
    expect(changes).toHaveBeenCalledWith('denied');
    unsubscribe();
    expect(status.removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('returns unknown and a no-op subscription when permission querying is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await expect(readMicrophoneAccessState()).resolves.toBe('unknown');
    const unavailableUnsubscribe = await subscribeToMicrophoneAccessChanges(vi.fn());
    expect(unavailableUnsubscribe()).toBeUndefined();

    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockRejectedValue(new Error('permission API failed')) },
    });
    await expect(readMicrophoneAccessState()).resolves.toBe('unknown');
    const failedUnsubscribe = await subscribeToMicrophoneAccessChanges(vi.fn());
    expect(failedUnsubscribe()).toBeUndefined();
  });
});
