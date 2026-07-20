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
  cleanupResources: cleanupResourcesMock,
  startRecording: startRecordingImplMock,
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

import { startRecording, stopRecording } from './controller';
import { recordingContext } from './context';

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
    streamId: 'stream-delayed',
    settings: {
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
          recordingContext.beginRecordingSession('recording-delayed');
          recordingContext.activateRecorder(recorder);
          resolve();
        };
      })
  );

  const start = startRecording(createStartParams());
  const stop = stopRecording(true);
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
  await expect(stop).resolves.toBeUndefined();
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
  const stopExpectation = expect(stopRecording(true)).rejects.toThrow(
    'background.runtime.recordingStopTimeout'
  );
  await vi.advanceTimersByTimeAsync(10_000);
  await stopExpectation;
  expect(cancelPendingMultiSourceRecordingStartMock).toHaveBeenCalledOnce();

  completeStart();
  await start;
  await expect(stopRecording(true)).resolves.toBeUndefined();
});
