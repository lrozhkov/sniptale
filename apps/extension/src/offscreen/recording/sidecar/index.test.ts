import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createFixedVideoOutputStreamMock, finalizeSidecarRecordingMock } = vi.hoisted(() => ({
  createFixedVideoOutputStreamMock: vi.fn(),
  finalizeSidecarRecordingMock: vi.fn(),
}));

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: createFixedVideoOutputStreamMock,
}));

vi.mock('../finalizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finalizer')>()),
  finalizeSidecarRecording: finalizeSidecarRecordingMock,
}));

import {
  resolveVideoOutputDimensions,
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  cleanupActiveSidecarRecorders,
  finalizeActiveSidecarRecordings,
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
  createFixedVideoOutputStreamMock.mockImplementation(
    (
      source: MediaStream,
      settings: ReturnType<typeof createSettings>,
      options: { frameRate: number }
    ) => {
      const sourceSettings = source.getVideoTracks()[0]?.getSettings() ?? {};
      const dimensions = resolveVideoOutputDimensions(
        sourceSettings.width ?? 1280,
        sourceSettings.height ?? 720,
        settings.output.resolution
      );
      const derived = createStream({
        stop: () => source.getTracks().forEach((track) => track.stop()),
        trackSettings: { ...dimensions, frameRate: options.frameRate },
      });
      return Promise.resolve({ dimensions, frameRate: options.frameRate, stream: derived });
    }
  );
});

afterEach(() => {
  cleanupActiveSidecarRecorders();
  vi.restoreAllMocks();
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

  it('uses default webcam constraints and rejects an unsupported selected codec', async () => {
    vi.spyOn(FakeMediaRecorder, 'isTypeSupported').mockReturnValue(false);
    const getUserMedia = vi.fn().mockResolvedValue(createStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(
      initializeSidecarRecorders({
        baseRecordingId: 'rec-1',
        settings: createSettings({ webcamDeviceId: null }),
      })
    ).rejects.toThrow('selected recording container and codec are not supported');

    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: {} });
    expect(FakeMediaRecorder.instances).toHaveLength(0);
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
      height: 1080,
      width: 1920,
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

function registerSidecarFinalizationTests() {
  it('does nothing when no sidecar session is active', async () => {
    await finalizeActiveSidecarRecordings(false);

    expect(finalizeSidecarRecordingMock).not.toHaveBeenCalled();
  });

  it('finalizes active webcam sidecars with stable save metadata', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    FakeMediaRecorder.instances[0]?.requestData();

    await finalizeActiveSidecarRecordings(true);

    expect(finalizeSidecarRecordingMock).toHaveBeenCalledWith({
      chunks: expect.any(Array),
      discard: true,
      filenameSuffix: 'webcam',
      mimeType: 'video/webm;codecs=vp9',
      recordingId: 'rec-1-webcam',
    });
    expect(finalizeSidecarRecordingMock.mock.calls[0]?.[0].chunks).toHaveLength(1);
  });

  it('surfaces sidecar finalization failures to the recording owner', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    FakeMediaRecorder.instances[0]?.requestData();
    finalizeSidecarRecordingMock.mockRejectedValueOnce(new Error('sidecar finalize failed'));

    await expect(finalizeActiveSidecarRecordings(false)).rejects.toThrow('sidecar finalize failed');
  });
}

function registerSidecarControlTests() {
  it('starts, pauses, resumes, flushes, and stops active webcam sidecars', async () => {
    installSidecarNavigator();

    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    startActiveSidecarRecorders(1000, vi.fn());
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

    startActiveSidecarRecorders(1000, vi.fn());
    resumeActiveSidecarRecorders();
    expect(FakeMediaRecorder.instances[0]?.state).toBe('recording');
  });

  it('keeps sidecar controls idle-safe when no sidecar session is active', async () => {
    startActiveSidecarRecorders(1000, vi.fn());
    pauseActiveSidecarRecorders();
    resumeActiveSidecarRecorders();

    await expect(stopActiveSidecarRecordersWithFlush()).resolves.toBeUndefined();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it('propagates an unexpected sidecar encoder failure to the recording owner', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    const onUnexpectedFailure = vi.fn();

    startActiveSidecarRecorders(1000, onUnexpectedFailure);
    FakeMediaRecorder.instances[0]?.onerror?.(
      Object.assign(new Event('error'), { error: new Error('webcam encoder failed') }) as ErrorEvent
    );

    expect(onUnexpectedFailure).toHaveBeenCalledWith(new Error('webcam encoder failed'));
  });
}

function registerSidecarStopTests() {
  it('returns the same stop promise when webcam sidecar stop is already pending', async () => {
    installSidecarNavigator();
    await initializeSidecarRecorders({
      baseRecordingId: 'rec-1',
      settings: createSettings(),
    });
    startActiveSidecarRecorders(1000, vi.fn());

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
    startActiveSidecarRecorders(1000, vi.fn());
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
  registerSidecarFinalizationTests();
  registerSidecarControlTests();
  registerSidecarStopTests();
  registerSidecarCleanupStateTests();
  registerSidecarCleanupFailureTests();
  registerSidecarCreationFailureTests();
});
