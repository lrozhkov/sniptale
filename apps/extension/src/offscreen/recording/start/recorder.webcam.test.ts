import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createSettings,
  createVideoStream,
  installMediaRecorderMock,
  mediaRecorderTestState,
} from './helpers.test-support';

const { getActiveSidecarWebcamSettingsMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  getActiveSidecarWebcamSettingsMock: vi.fn(() => null as { height: number; width: number } | null),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sidecar')>();
  return {
    ...actual,
    getActiveSidecarWebcamSettings: getActiveSidecarWebcamSettingsMock,
    hasActiveSidecarSession: vi.fn(() => false),
    startActiveSidecarRecorders: vi.fn(),
  };
});

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../runtime-messaging/best-effort')>();
  return {
    ...actual,
    sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
  };
});

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';

beforeEach(() => {
  vi.clearAllMocks();
  installMediaRecorderMock(true);
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = createVideoStream();
});

it('publishes actual webcam settings on recording start', () => {
  getActiveSidecarWebcamSettingsMock.mockReturnValueOnce({ height: 720, width: 1280 });
  recordingContext.beginRecordingSession('recording-webcam');

  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-webcam',
    settings: createSettings(),
    cursorCaptureMode: 'separate',
    trackSettings: { displaySurface: 'window', frameRate: 30, height: 720, width: 1280 },
    durationTracker: recordingContext.durationTracker,
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        recordingId: 'recording-webcam',
        cursorCaptureMode: 'separate',
        displaySurface: 'window',
        webcamSettings: { height: 720, width: 1280 },
      },
    })
  );
});

it('fails fast when the recording video stream is missing', () => {
  recordingContext.videoStream = null;

  expect(() =>
    finalizeRecordingBootstrap({
      resolvedRecordingId: 'recording-missing-stream',
      settings: createSettings(),
      trackSettings: { frameRate: 30, height: 720, width: 1280 },
      durationTracker: recordingContext.durationTracker,
    })
  ).toThrow('Recording video stream is not initialized');
});

it('resolves one terminal stop outcome without a parallel runtime error', () => {
  const resolveStop = vi.fn();
  const rejectStop = vi.fn();
  recordingContext.beginRecordingSession('recording-error');
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-error',
    settings: createSettings(),
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
    durationTracker: recordingContext.durationTracker,
  });
  recordingContext.beginStopRequest({ reject: rejectStop, resolve: resolveStop });

  mediaRecorderTestState.lastInstance?.onerror?.(
    Object.assign(new Event('error'), { error: new Error('recorder failed') })
  );

  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({ type: VideoMessageType.OFFSCREEN_ERROR }),
    })
  );
  expect(resolveStop).toHaveBeenCalledWith({
    error: 'recorder failed',
    result: 'terminal-failure',
  });
  expect(rejectStop).not.toHaveBeenCalled();
  expect(recordingContext.videoStream).toBeNull();
});

it('uses the fallback recorder error when native error details are absent', () => {
  recordingContext.beginRecordingSession('recording-fallback-error');
  finalizeRecordingBootstrap({
    resolvedRecordingId: 'recording-fallback-error',
    settings: createSettings(),
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
    durationTracker: recordingContext.durationTracker,
  });

  mediaRecorderTestState.lastInstance?.onerror?.(new Event('error'));

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        error: 'The recording encoder failed unexpectedly.',
        phase: 'runtime',
        recordingId: 'recording-fallback-error',
      }),
    })
  );
});
