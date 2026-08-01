import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { TestMediaStream } from './multi-source/media-stream.test-support';

const {
  cancelPendingMultiSourceRecordingStartMock,
  cleanupResourcesMock,
  startRecordingImplMock,
  stopActiveSidecarRecordersWithFlushMock,
} = vi.hoisted(() => ({
  cancelPendingMultiSourceRecordingStartMock: vi.fn(),
  cleanupResourcesMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopActiveSidecarRecordersWithFlushMock: vi.fn(),
}));

vi.mock('./start/index', () => ({
  startRecording: startRecordingImplMock,
}));
vi.mock('./start/cleanup', () => ({
  cleanupResources: cleanupResourcesMock,
}));
vi.mock('./multi-source', () => ({
  cancelPendingMultiSourceRecordingStart: cancelPendingMultiSourceRecordingStartMock,
  getActiveMultiSourceRecordingId: vi.fn(() => null),
  hasActiveMultiSourceRecording: vi.fn(() => false),
  pauseMultiSourceRecording: vi.fn(),
  resumeMultiSourceRecording: vi.fn(),
  startMultiSourceRecording: vi.fn(),
  stopMultiSourceRecording: vi.fn(),
  updateMultiSourceRecordingSettings: vi.fn(),
}));
vi.mock('./sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sidecar')>()),
  hasActiveSidecarSession: vi.fn(() => false),
  stopActiveSidecarRecordersWithFlush: stopActiveSidecarRecordersWithFlushMock,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
}));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

import {
  activateViewportOutput,
  pauseRecording,
  resumeRecording,
  setViewportDrawState,
  startRecording,
  stopRecording,
  updateRecordingSettings,
} from './controller';
import { recordingContext } from './context';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

class ActiveMediaRecorderFixture extends EventTarget implements MediaRecorder {
  readonly audioBitsPerSecond = 0;
  readonly mimeType = 'video/webm';
  ondataavailable: MediaRecorder['ondataavailable'] = null;
  onerror: MediaRecorder['onerror'] = null;
  onpause: MediaRecorder['onpause'] = null;
  onresume: MediaRecorder['onresume'] = null;
  onstart: MediaRecorder['onstart'] = null;
  onstop: MediaRecorder['onstop'] = null;
  readonly requestData = vi.fn();
  readonly state: RecordingState = 'recording';
  readonly stop = vi.fn();
  readonly stream = new TestMediaStream([]);
  readonly videoBitsPerSecond = 0;

  pause(): void {}
  resume(): void {}
  start(): void {}
}

function createStartParams(): Parameters<typeof startRecording>[0] {
  return {
    generation: 1,
    recordingId: 'recording-delayed',
    streamInstanceId: 'stream-instance-delayed',
    streamId: 'stream-delayed',
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      autoFadeDelay: 0,
      countdownSeconds: 0,
      diagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
      openEditorAfterRecording: false,
      quality: VideoQuality.HIGH,
      systemAudioEnabled: false,
    },
  };
}

const sourceBinding = {
  generation: 1,
  recordingId: 'recording-delayed',
  streamInstanceId: 'stream-instance-delayed',
};

function createActiveRecorderFixture() {
  const recorder = new ActiveMediaRecorderFixture();
  return { recorder, stop: recorder.stop };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  stopActiveSidecarRecordersWithFlushMock.mockResolvedValue(undefined);
});

it('waits for a delayed start and terminates activation before acknowledging stop', async () => {
  let completeStart!: () => void;
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = () => {
          recordingContext.beginRecordingSession('recording-delayed', 1);
          recordingContext.bindStreamInstance(sourceBinding);
          recordingContext.bindStartingRecorder(recorder);
          recordingContext.activateRecorder(recorder);
          resolve();
        };
      })
  );

  const start = startRecording(createStartParams());
  const stop = stopRecording(sourceBinding, true);
  let stopSettled = false;
  void stop.then(() => {
    stopSettled = true;
  });
  await flushPromises();
  expect(stopSettled).toBe(false);

  completeStart();
  await start;
  await vi.waitFor(() => expect(stopRecorder).toHaveBeenCalledOnce());
  recordingContext.stopRecordingResolve?.();
  await expect(stop).resolves.toEqual({ result: 'stopped' });
});

it('cancels a bound recorder that has not emitted its native start event', async () => {
  const cancelStartingRecorder = vi.fn();
  const { recorder, stop: stopRecorder } = createActiveRecorderFixture();
  startRecordingImplMock.mockImplementationOnce(async () => {
    recordingContext.beginRecordingSession('recording-delayed', 1);
    recordingContext.bindStreamInstance(sourceBinding);
    recordingContext.bindStartingRecorder(recorder);
    recordingContext.registerStartingRecorderCancellation(recorder, cancelStartingRecorder);
  });

  await startRecording(createStartParams());
  await expect(stopRecording(sourceBinding, true)).resolves.toEqual({ result: 'stopped' });

  expect(cancelStartingRecorder).toHaveBeenCalledOnce();
  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(stopRecorder).not.toHaveBeenCalled();
});

it('fails a stuck start cancellation within a deadline and allows a safe retry', async () => {
  vi.useFakeTimers();
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );

  const start = startRecording(createStartParams());
  const stopExpectation = expect(stopRecording(sourceBinding, true)).resolves.toEqual({
    error: 'background.runtime.recordingStopTimeout',
    result: 'terminal-failure',
  });
  await vi.advanceTimersByTimeAsync(10_000);
  await stopExpectation;
  expect(cancelPendingMultiSourceRecordingStartMock).toHaveBeenCalledOnce();

  completeStart();
  await start;
  await expect(stopRecording(sourceBinding, true)).resolves.toEqual({ result: 'stopped' });
});

it('rejects a delayed stop whose source identity belongs to another start', async () => {
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );
  const start = startRecording(createStartParams());

  await expect(
    stopRecording(
      {
        generation: 1,
        recordingId: 'recording-stale',
        streamInstanceId: 'stream-instance-stale',
      },
      true
    )
  ).rejects.toThrow('Stale recording source binding');
  expect(cancelPendingMultiSourceRecordingStartMock).not.toHaveBeenCalled();

  completeStart();
  await start;
});

it('rejects delayed pause, resume, and settings commands from another recording start', async () => {
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );
  const start = startRecording(createStartParams());
  const stale = {
    generation: 0,
    recordingId: 'recording-stale',
    streamInstanceId: 'stream-instance-stale',
  };

  expect(() => pauseRecording(stale)).toThrow('Stale recording source binding');
  expect(() => resumeRecording(stale)).toThrow('Stale recording source binding');
  expect(() => updateRecordingSettings(stale, { microphoneEnabled: false })).toThrow(
    'Stale recording source binding'
  );

  completeStart();
  await start;
});

it('changes viewport drawing only for the active recording source binding', async () => {
  let completeStart!: () => void;
  startRecordingImplMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        completeStart = resolve;
      })
  );
  const activate = vi.fn();
  const setFrozen = vi.fn(() => 'applied' as const);
  recordingContext.tabOutputControls = {
    activate,
    applyFrozenSourceGeometry: vi.fn(() => 'applied' as const),
    readFrozenSourceSize: vi.fn(),
    setFrozen,
  };
  const start = startRecording(createStartParams());

  activateViewportOutput(sourceBinding);
  expect(activate).toHaveBeenCalledOnce();
  expect(setViewportDrawState(sourceBinding, true, 'navigation-1')).toBe('applied');
  expect(setViewportDrawState(sourceBinding, false, 'navigation-1')).toBe('applied');
  expect(setFrozen).toHaveBeenNthCalledWith(1, 'navigation-1', true);
  expect(setFrozen).toHaveBeenNthCalledWith(2, 'navigation-1', false);

  expect(() =>
    setViewportDrawState(
      {
        generation: 0,
        recordingId: 'recording-stale',
        streamInstanceId: 'stream-instance-stale',
      },
      true,
      'navigation-stale'
    )
  ).toThrow('Stale recording source binding');
  expect(setFrozen).toHaveBeenCalledTimes(2);

  completeStart();
  await start;
});
