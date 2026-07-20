import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  cleanupActiveSidecarRecorders,
  getActiveSidecarWebcamSettings,
  hasActiveSidecarSession,
  pauseActiveSidecarRecorders,
  initializeSidecarRecorders,
  resumeActiveSidecarRecorders,
  startActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from '.';
import {
  createSettings,
  createStream,
  FakeMediaRecorder,
  installSidecarNavigator,
} from './index.test-support';

beforeEach(() => {
  cleanupActiveSidecarRecorders();
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
});

afterEach(() => {
  cleanupActiveSidecarRecorders();
  vi.unstubAllGlobals();
});

function registerSidecarInitializationTests() {
  it('requests a selected webcam as video-only media and creates a stable sidecar recorder', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(createStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { deviceId: { exact: 'cam-1' } },
    });
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0]?.stream.getAudioTracks()).toEqual([]);
    expect(hasActiveSidecarSession()).toBe(true);
  });

  it('does not acquire webcam media when webcam capture is disabled', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings({ webcamEnabled: false }),
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(hasActiveSidecarSession()).toBe(false);
  });

  it('uses default webcam constraints and mime type fallback when needed', async () => {
    vi.spyOn(FakeMediaRecorder, 'isTypeSupported').mockReturnValue(false);
    const getUserMedia = vi.fn().mockResolvedValue(createStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings({ webcamDeviceId: null }),
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: {} });
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('video/webm');
  });
}

function registerSidecarConstraintTests() {
  it('returns null webcam settings when no sidecar session is active', () => {
    expect(getActiveSidecarWebcamSettings()).toBeNull();
  });

  it('reads numeric settings from the active webcam sidecar', async () => {
    installSidecarNavigator(
      createStream({ trackSettings: { frameRate: 30, height: 720, width: 1280 } })
    );

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });

    expect(getActiveSidecarWebcamSettings()).toEqual({
      frameRate: 30,
      height: 720,
      width: 1280,
    });
  });

  it('applies webcam quality presets as ideal constraints', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(createStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings({
        webcamQuality: {
          frameRate: WebcamFrameRatePreset.FPS60,
          resolution: WebcamResolutionPreset.P1080,
        },
      }),
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        deviceId: { exact: 'cam-1' },
        frameRate: { ideal: 60 },
        height: { ideal: 1080 },
        width: { ideal: 1920 },
      },
    });
  });
}

function registerSidecarControlTests() {
  it('starts, pauses, resumes, flushes, and stops active webcam sidecars', async () => {
    installSidecarNavigator();

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    startActiveSidecarRecorders(1000);
    pauseActiveSidecarRecorders();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('paused');

    resumeActiveSidecarRecorders();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('recording');

    await expect(stopActiveSidecarRecordersWithFlush()).resolves.toBeUndefined();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('inactive');
  });

  it('ignores pause and resume for sidecar recorders in other states', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });

    pauseActiveSidecarRecorders();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('inactive');

    startActiveSidecarRecorders(1000);
    resumeActiveSidecarRecorders();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('recording');
  });

  it('keeps sidecar controls idle-safe when no sidecar session is active', async () => {
    startActiveSidecarRecorders(1000);
    pauseActiveSidecarRecorders();
    resumeActiveSidecarRecorders();

    await expect(stopActiveSidecarRecordersWithFlush()).resolves.toBeUndefined();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });
}

function registerSidecarStopTests() {
  it('returns the same stop promise when webcam sidecar stop is already pending', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    startActiveSidecarRecorders(1000);

    const firstStop = stopActiveSidecarRecordersWithFlush();
    const secondStop = stopActiveSidecarRecordersWithFlush();

    expect(secondStop).toBe(firstStop);
    await firstStop;
  });

  it('resolves sidecar stop immediately for inactive recorders', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });

    await expect(stopActiveSidecarRecordersWithFlush()).resolves.toBeUndefined();
  });

  it('rejects sidecar stop when a recorder emits an error without a native error', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    startActiveSidecarRecorders(1000);
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) {
      throw new Error('Expected webcam recorder');
    }
    recorder.stop = vi.fn();
    const stopPromise = stopActiveSidecarRecordersWithFlush();

    recorder.onerror?.({} as ErrorEvent);

    await expect(stopPromise).rejects.toThrow('A sidecar recorder failed.');
    recorder.onstop?.();
  });
}

function registerSidecarCleanupStateTests() {
  it('stops webcam tracks during cleanup and clears active sidecar state', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(createStream({ stop })) },
    });

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });

    cleanupActiveSidecarRecorders();

    expect(stop).toHaveBeenCalledOnce();
    expect(hasActiveSidecarSession()).toBe(false);
  });
}

function registerSidecarCleanupFailureTests() {
  it('continues cleanup when a sidecar recorder stop throws', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(createStream({ stop })) },
    });
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) {
      throw new Error('Expected webcam recorder');
    }
    recorder.state = 'recording';
    recorder.stop = () => {
      throw new Error('stop failed');
    };

    cleanupActiveSidecarRecorders();

    expect(stop).toHaveBeenCalledOnce();
    expect(hasActiveSidecarSession()).toBe(false);
  });
}

function registerSidecarCreationFailureTests() {
  it('stops acquired webcam tracks when sidecar creation fails', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createStream({ hasVideo: false, stop })),
      },
    });

    await expect(
      initializeSidecarRecorders({
        baseRecordingId: 'rec-1',
        settings: createSettings(),
      })
    ).rejects.toThrow('Webcam sidecar stream is missing a video track.');

    expect(stop).toHaveBeenCalledOnce();
    expect(hasActiveSidecarSession()).toBe(false);
  });
}

describe('offscreen recording sidecar', () => {
  registerSidecarInitializationTests();
  registerSidecarConstraintTests();
  registerSidecarControlTests();
  registerSidecarStopTests();
  registerSidecarCleanupStateTests();
  registerSidecarCleanupFailureTests();
  registerSidecarCreationFailureTests();
});
