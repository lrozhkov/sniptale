import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoMicrophoneActivity } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { loggerDebugMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: loggerDebugMock }),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { initializeDurationPublishing } from './duration';
import {
  createMultiSourceLifecycle,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';
import { TestMediaRecorder } from './media-recorder.test-support';
import { createAudioStream } from './media-stream.test-support';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import type { MicrophoneActivityObserver } from '../stream/microphone-activity';

function createMicrophoneRecorder(observation: MicrophoneActivityObserver): MultiSourceRecorder {
  const recorder = new TestMediaRecorder({ state: 'recording', stream: createAudioStream() });
  return {
    artifact: null,
    artifactSession: {
      abort: vi.fn().mockResolvedValue(undefined),
      recorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    label: null,
    microphoneActivity: observation,
    recorder,
    recordingId: 'multi-microphone',
    sourceIndex: 999,
    stream: recorder.stream,
    trackSettings: {},
  };
}

function createSession(
  recordingId: string,
  startedAt: number,
  audioRecorder: MultiSourceRecorder | null = null
): MultiSourceSession {
  const lifecycle = createMultiSourceLifecycle();
  lifecycle.activate();
  return {
    audioRecorder,
    durationTimer: null,
    lifecycle,
    recorders: [],
    recordingId,
    settings: DEFAULT_VIDEO_SETTINGS,
    staging: createRecordingStagingCoordinatorTestDouble(),
    startedAt,
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('publishes the latest microphone advisory with duration after aggregate activation', async () => {
  vi.useFakeTimers();
  let activity: VideoMicrophoneActivity = { status: 'ready', level: 0, warning: true };
  const observation = {
    get current() {
      return activity;
    },
    dispose: vi.fn(),
    setEnabled: vi.fn(),
    setPhase: vi.fn(),
    setSource: vi.fn(),
  };
  const session = createSession(
    'multi-advisory',
    Date.now() - 2_000,
    createMicrophoneRecorder(observation)
  );
  initializeDurationPublishing(session);
  expect(observation.setPhase).toHaveBeenCalledExactlyOnceWith('recording');
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: 'RECORDING_DURATION_UPDATED',
    duration: 3,
    recordingId: 'multi-advisory',
    microphoneActivity: { status: 'ready', level: 0, warning: true },
  });
  activity = { status: 'ready', level: 0.5, warning: false };
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: 'RECORDING_DURATION_UPDATED',
    duration: 4,
    recordingId: 'multi-advisory',
    microphoneActivity: { status: 'ready', level: 0.5, warning: false },
  });
  expect(observation.dispose).not.toHaveBeenCalled();
  expect(observation.setSource).not.toHaveBeenCalled();
});

it('continues duration publication without inventing microphone activity after a transport failure', async () => {
  vi.useFakeTimers();
  const failure = new Error('Runtime temporarily unavailable');
  sendRuntimeMessageMock.mockRejectedValueOnce(failure);
  const session = createSession('multi-without-microphone', Date.now());
  initializeDurationPublishing(session);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(loggerDebugMock).toHaveBeenCalledExactlyOnceWith(
    'Failed to publish multi-source duration',
    failure
  );
  expect(sendRuntimeMessageMock.mock.calls.map(([message]) => message)).toEqual([
    { type: 'RECORDING_DURATION_UPDATED', duration: 1, recordingId: 'multi-without-microphone' },
    { type: 'RECORDING_DURATION_UPDATED', duration: 2, recordingId: 'multi-without-microphone' },
  ]);
  expect(session.durationTimer).not.toBeNull();
});

it('publishes elapsed multi-source duration on the session timer', async () => {
  vi.useFakeTimers();
  const session = createSession('multi-1', Date.now() - 2_000);

  initializeDurationPublishing(session);
  await vi.advanceTimersByTimeAsync(1_000);

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'RECORDING_DURATION_UPDATED',
    duration: expect.any(Number),
    recordingId: 'multi-1',
  });
  expect(session.durationTimer).not.toBeNull();

  if (session.durationTimer) {
    clearInterval(session.durationTimer);
  }
  vi.useRealTimers();
});
