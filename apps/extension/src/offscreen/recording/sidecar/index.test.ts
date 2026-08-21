import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from './types';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { TestMediaRecorder } from '../multi-source/media-recorder.test-support';
import { createPreparedRecordingAssetForTest } from '../../../composition/persistence/recordings/staging/test-support';

const { createWebcamSidecarRecorderMock, loggerDebugMock } = vi.hoisted(() => ({
  createWebcamSidecarRecorderMock: vi.fn(),
  loggerDebugMock: vi.fn(),
}));

vi.mock('./webcam', () => ({
  createWebcamSidecarRecorder: createWebcamSidecarRecorderMock,
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: loggerDebugMock }),
}));

import {
  cleanupActiveSidecarRecorders,
  getActiveSidecarVideoProfiles,
  getActiveSidecarWebcamSettings,
  hasActiveSidecarSession,
  initializeSidecarRecorders,
  pauseActiveSidecarRecorders,
  resumeActiveSidecarRecorders,
  setActiveSidecarWebcamEnabled,
  startActiveSidecarRecorders,
  stopActiveSidecarRecordersWithFlush,
} from '.';

function createSidecar(): RecordingSidecarRecorder {
  const file = new File(['webcam'], 'webcam.webm', { type: 'video/webm' });
  const stream = createTrackedStream();
  const recorder = new TestMediaRecorder({ stream });
  return {
    artifact: null,
    artifactSession: {
      abort: vi.fn().mockResolvedValue(undefined),
      recorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue({
        artifactId: 'rec-webcam',
        asset: createPreparedRecordingAssetForTest(file, 'rec-webcam'),
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    },
    filenameSuffix: 'webcam',
    kind: 'webcam',
    recorder,
    release: vi.fn(() => stream.getTracks().forEach((track) => track.stop())),
    recordingId: 'rec-webcam',
    stream,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanupActiveSidecarRecorders();
});

describe('recording sidecar lifecycle', () => {
  it('keeps camera mode free of sidecar ownership', async () => {
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      captureMode: CaptureMode.CAMERA,
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    expect(createWebcamSidecarRecorderMock).not.toHaveBeenCalled();
    expect(hasActiveSidecarSession()).toBe(false);
  });

  it('propagates sidecar creation failure without retaining a session', async () => {
    createWebcamSidecarRecorderMock.mockRejectedValueOnce(new Error('webcam setup failed'));

    await expect(
      initializeSidecarRecorders({
        baseRecordingId: 'rec',
        coordinator: createRecordingStagingCoordinatorTestDouble(),
        settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
      })
    ).rejects.toThrow('webcam setup failed');
    expect(hasActiveSidecarSession()).toBe(false);
  });

  it('does not retain a session when no sidecar recorder is requested', async () => {
    createWebcamSidecarRecorderMock.mockResolvedValueOnce(null);

    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: false },
    });

    expect(hasActiveSidecarSession()).toBe(false);
  });

  it('starts and terminally drains the webcam artifact session', async () => {
    const sidecar = createSidecar();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    startActiveSidecarRecorders(vi.fn());
    const artifacts = await stopActiveSidecarRecordersWithFlush();

    expect(sidecar.artifactSession.start).toHaveBeenCalledWith();
    expect(sidecar.artifactSession.stop).toHaveBeenCalledOnce();
    expect(artifacts[0]?.artifactId).toBe('rec-webcam');
  });

  it('returns one stop promise and exposes actual encoder dimensions', async () => {
    const sidecar = createSidecar();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    expect(getActiveSidecarVideoProfiles()).toEqual([
      { dimensions: { height: 720, width: 1280 }, frameRate: 30 },
    ]);
    expect(stopActiveSidecarRecordersWithFlush()).toBe(stopActiveSidecarRecordersWithFlush());
  });

  it('surfaces unexpected artifact failure through the semantic callback', async () => {
    const sidecar = createSidecar();
    const onFailure = vi.fn();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });
    startActiveSidecarRecorders(onFailure);

    const callbacks = vi.mocked(sidecar.artifactSession.setLifecycleCallbacks).mock.calls[0]?.[0];
    callbacks?.onFailure?.(new Error('writer failed'));
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'writer failed' }));
  });

  it('normalizes a non-Error sidecar start failure', async () => {
    const sidecar = createSidecar();
    vi.mocked(sidecar.artifactSession.start).mockImplementationOnce(() => {
      throw 'encoder unavailable';
    });
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    expect(() => startActiveSidecarRecorders(vi.fn())).toThrow('encoder unavailable');
  });

  it('applies state-aware pause, resume, and webcam enable controls', async () => {
    const sidecar = createSidecar();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    sidecar.recorder.start();
    pauseActiveSidecarRecorders();
    expect(sidecar.recorder.state).toBe('paused');
    pauseActiveSidecarRecorders();
    expect(sidecar.recorder.state).toBe('paused');

    resumeActiveSidecarRecorders();
    expect(sidecar.recorder.state).toBe('recording');
    resumeActiveSidecarRecorders();
    expect(sidecar.recorder.state).toBe('recording');

    setActiveSidecarWebcamEnabled(false);
    expect(sidecar.stream.getVideoTracks()[0]?.enabled).toBe(false);
    setActiveSidecarWebcamEnabled(true);
    expect(sidecar.stream.getVideoTracks()[0]?.enabled).toBe(true);
    expect(getActiveSidecarWebcamSettings()).toEqual({
      frameRate: 30,
      height: 720,
      width: 1280,
    });
  });

  it('records a terminal artifact and reports only an unrequested sidecar stop', async () => {
    const sidecar = createSidecar();
    const onFailure = vi.fn();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });
    startActiveSidecarRecorders(onFailure);
    const callbacks = vi.mocked(sidecar.artifactSession.setLifecycleCallbacks).mock.calls[0]?.[0];
    const artifact = await sidecar.artifactSession.stop();

    callbacks?.onStop?.(artifact);
    expect(sidecar.artifact).toBe(artifact);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'A sidecar recorder stopped unexpectedly.' })
    );

    void stopActiveSidecarRecordersWithFlush();
    callbacks?.onStop?.(artifact);
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it.each([
    { height: 720 },
    { width: 1280 },
    { height: 720, width: 1.5 },
    { height: 1.5, width: 1280 },
    { height: 720, width: 0 },
    { height: 0, width: 1280 },
  ] satisfies MediaTrackSettings[])(
    'rejects unavailable encoder dimensions %#',
    async (trackSettings) => {
      const sidecar = createSidecar();
      sidecar.trackSettings = trackSettings;
      createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
      await initializeSidecarRecorders({
        baseRecordingId: 'rec',
        coordinator: createRecordingStagingCoordinatorTestDouble(),
        settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
      });

      expect(() => getActiveSidecarVideoProfiles()).toThrow(
        'Webcam recording profile is unavailable for rec-webcam.'
      );
    }
  );

  it('keeps stop and dimension reads idle-safe without an active session', async () => {
    expect(getActiveSidecarVideoProfiles()).toEqual([]);
    expect(getActiveSidecarWebcamSettings()).toBeNull();
    await expect(stopActiveSidecarRecordersWithFlush()).resolves.toEqual([]);
  });

  it('aborts staging bindings and stops owned tracks during cleanup', async () => {
    const sidecar = createSidecar();
    const [track] = sidecar.stream.getTracks();
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    cleanupActiveSidecarRecorders();
    expect(sidecar.artifactSession.abort).toHaveBeenCalledOnce();
    expect(track?.stop).toHaveBeenCalledOnce();
  });

  it('finishes stream cleanup when aborting the staging binding fails', async () => {
    const sidecar = createSidecar();
    const [track] = sidecar.stream.getTracks();
    vi.mocked(sidecar.artifactSession.abort).mockRejectedValueOnce(new Error('abort failed'));
    createWebcamSidecarRecorderMock.mockResolvedValue(sidecar);
    await initializeSidecarRecorders({
      baseRecordingId: 'rec',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });

    cleanupActiveSidecarRecorders();

    expect(track?.stop).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(loggerDebugMock).toHaveBeenCalledWith(
        'Failed to abort sidecar artifact during cleanup',
        expect.objectContaining({ message: 'abort failed' })
      )
    );
  });
});
