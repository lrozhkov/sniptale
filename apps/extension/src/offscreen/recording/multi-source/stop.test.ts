import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { FinalizedRecordingStagingArtifact } from '../../../composition/persistence/recordings/staging';
import { createPreparedRecordingAssetForTest } from '../../../composition/persistence/recordings/staging/test-support';
import { createMultiSourceLifecycle, type MultiSourceSession } from './state';
import { setActiveMultiSourceSession } from './state';
import { stopMultiSourceSession } from './stop';
import { createTrackedStream } from './media-stream.test-support';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

vi.mock('../../../platform/runtime-messaging', async (original) => ({
  ...(await original<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../post-record-publication', async (original) => ({
  ...(await original<typeof import('../post-record-publication')>()),
  retryPendingPostRecordResult: vi.fn().mockResolvedValue(false),
}));

const startMultiSource = vi.hoisted(() => vi.fn());
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  startMultiSourceRecording: startMultiSource,
}));

beforeEach(() => {
  vi.mocked(sendRuntimeMessage).mockClear();
  setActiveMultiSourceSession(null);
});

function createArtifact(id: string): FinalizedRecordingStagingArtifact {
  const file = new File(['media'], `${id}.webm`, { type: 'video/webm' });
  return {
    artifactId: id,
    asset: createPreparedRecordingAssetForTest(file, id),
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function createSession(): MultiSourceSession {
  const lifecycle = createMultiSourceLifecycle();
  lifecycle.activate();
  const artifact = createArtifact('rec-window-1');
  return {
    audioRecorder: null,
    durationTimer: null,
    lifecycle,
    recorders: [
      {
        artifact: null,
        artifactSession: {
          abort: vi.fn().mockResolvedValue(undefined),
          recorder: {} as MediaRecorder,
          setLifecycleCallbacks: vi.fn(),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(artifact),
        },
        label: 'Window 1',
        recorder: {} as MediaRecorder,
        recordingId: artifact.artifactId,
        sourceIndex: 0,
        stream: { getTracks: () => [] } as unknown as MediaStream,
        trackSettings: { height: 720, width: 1280 },
      },
    ],
    recordingId: 'rec',
    settings: DEFAULT_VIDEO_SETTINGS,
    staging: {
      abort: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getPendingBytes: vi.fn(() => 0),
      openArtifact: vi.fn(),
    },
    startedAt: Date.now(),
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

it('deduplicates stop and finalizes only after every artifact session drains', async () => {
  const session = createSession();
  const finalizeSession = vi.fn().mockResolvedValue(undefined);
  setActiveMultiSourceSession(session);

  const first = stopMultiSourceSession({ discard: false, finalizeSession, session });
  const second = stopMultiSourceSession({ discard: false, finalizeSession, session });
  expect(first).toBe(second);
  await first;

  expect(session.recorders[0]?.artifactSession.stop).toHaveBeenCalledOnce();
  expect(finalizeSession).toHaveBeenCalledWith(session);
});

it('aborts staging instead of finalizing a discarded artifact set', async () => {
  const session = createSession();
  const finalizeSession = vi.fn();
  setActiveMultiSourceSession(session);

  await stopMultiSourceSession({ discard: true, finalizeSession, session });

  expect(session.staging.abort).toHaveBeenCalledOnce();
  expect(finalizeSession).not.toHaveBeenCalled();
});

it('notifies background once after discarded staging drains, including concurrent stop callers', async () => {
  vi.mocked(sendRuntimeMessage).mockClear();
  const session = createSession();
  let release!: () => void;
  let entered!: () => void;
  const drained = new Promise<void>((resolve) => {
    release = resolve;
  });
  const aborting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.mocked(session.staging.abort).mockImplementation(async () => {
    entered();
    await drained;
  });
  setActiveMultiSourceSession(session);
  const params = { discard: true, finalizeSession: vi.fn(), session };
  const first = stopMultiSourceSession(params);
  const second = stopMultiSourceSession(params);
  await aborting;
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  release();
  await Promise.all([first, second]);
  expect(sendRuntimeMessage).toHaveBeenCalledExactlyOnceWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId: session.recordingId,
  });
});

it('releases only the recording-owned webcam lease during normal stop', async () => {
  const session = createSession();
  const webcamRelease = vi.fn();
  const webcamArtifact = createArtifact('rec-webcam');
  session.webcamRecorder = {
    artifact: null,
    artifactSession: {
      abort: vi.fn().mockResolvedValue(undefined),
      recorder: {} as MediaRecorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(webcamArtifact),
    },
    filenameSuffix: '-webcam',
    kind: 'webcam',
    recorder: {} as MediaRecorder,
    recordingId: webcamArtifact.artifactId,
    release: webcamRelease,
    sourceLabel: 'Desk camera',
    stream: createTrackedStream(),
    trackSettings: { height: 720, width: 1280 },
  };
  const finalizeSession = vi.fn().mockResolvedValue(undefined);
  setActiveMultiSourceSession(session);

  await stopMultiSourceSession({ discard: false, finalizeSession, session });

  expect(webcamRelease).toHaveBeenCalledOnce();
});

it('waits for starting artifact abort through the bound controller before reporting stopped', async () => {
  const controller = await import('../controller');
  const session = createSession();
  session.lifecycle = createMultiSourceLifecycle();
  let releaseAbort!: () => void;
  let enteredAbort!: () => void;
  let enteredStart!: () => void;
  const abortPending = new Promise<void>((resolve) => {
    releaseAbort = resolve;
  });
  const abortEntered = new Promise<void>((resolve) => {
    enteredAbort = resolve;
  });
  const startEntered = new Promise<void>((resolve) => {
    enteredStart = resolve;
  });
  vi.mocked(session.recorders[0]!.artifactSession.abort).mockImplementation(async () => {
    enteredAbort();
    await abortPending;
  });
  startMultiSource.mockImplementationOnce(async () => {
    setActiveMultiSourceSession(session);
    enteredStart();
    await session.lifecycle.startPromise;
  });
  const binding = {
    recordingId: session.recordingId,
    generation: 1,
    streamInstanceId: 'source-start',
  };
  const starting = controller.startRecording({
    ...binding,
    streamId: 'desktop-multi',
    settings: { ...DEFAULT_VIDEO_SETTINGS, sourceCount: 2 },
  });
  await startEntered;
  const stopping = controller.stopRecording(binding, true);
  let settled = false;
  void stopping.then(() => {
    settled = true;
  });
  await abortEntered;
  await new Promise<void>((resolve) => setImmediate(resolve));
  const duplicate = controller.stopRecording(binding, true);
  const duplicateOutcome = duplicate.catch((error: unknown) => error);
  const settledBeforeAbort = settled;
  const notificationsBeforeAbort = vi.mocked(sendRuntimeMessage).mock.calls.length;
  releaseAbort();
  await starting;
  await expect(stopping).resolves.toEqual({ result: 'stopped' });
  await expect(duplicateOutcome).resolves.toEqual({ result: 'stopped' });
  expect(duplicate).toBe(stopping);
  expect(settledBeforeAbort).toBe(false);
  expect(notificationsBeforeAbort).toBe(0);
  expect(sendRuntimeMessage).toHaveBeenCalledExactlyOnceWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId: session.recordingId,
  });
});

it.each(['starting-artifact', 'starting-staging', 'active-staging'] as const)(
  'retains rejected cleanup without a success notification or repeat work: %s',
  async (failure) => {
    const session = createSession();
    if (failure.startsWith('starting')) session.lifecycle = createMultiSourceLifecycle();
    if (failure === 'starting-artifact')
      vi.mocked(session.recorders[0]!.artifactSession.abort).mockRejectedValue(
        new Error('Artifact abort failed')
      );
    else vi.mocked(session.staging.abort).mockRejectedValue(new Error('Staging abort failed'));
    setActiveMultiSourceSession(session);
    const params = { discard: true, finalizeSession: vi.fn(), session };
    const first = stopMultiSourceSession(params);
    await expect(first).rejects.toThrow();
    const calls = vi.mocked(session.staging.abort).mock.calls.length;
    const retry = stopMultiSourceSession(params);
    expect(retry).toBe(first);
    await expect(retry).rejects.toThrow();
    expect(session.staging.abort).toHaveBeenCalledTimes(calls);
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
  }
);

it('retains starting cleanup failure through the controller after the active session is gone', async () => {
  const controller = await import('../controller');
  const session = createSession();
  session.recordingId = 'failed-starting-cleanup';
  session.lifecycle = createMultiSourceLifecycle();
  vi.mocked(session.recorders[0]!.artifactSession.abort).mockRejectedValue(
    new Error('Abort refused')
  );
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  startMultiSource.mockImplementationOnce(async () => {
    setActiveMultiSourceSession(session);
    started();
    await session.lifecycle.startPromise;
  });
  const binding = {
    recordingId: session.recordingId,
    generation: 2,
    streamInstanceId: 'failed-source',
  };
  const starting = controller.startRecording({
    ...binding,
    streamId: 'desktop-multi',
    settings: { ...DEFAULT_VIDEO_SETTINGS, sourceCount: 2 },
  });
  await entered;
  const first = await controller.stopRecording(binding, true);
  await starting;
  expect(first.result).toBe('terminal-failure');
  await expect(controller.stopRecording(binding, true)).resolves.toEqual(first);
  expect(session.recorders[0]!.artifactSession.abort).toHaveBeenCalledOnce();
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('honors explicit discard even if an encoder fails while stopping', async () => {
  const session = createSession();
  const discard = vi.fn().mockResolvedValue(undefined);
  session.staging.discard = discard;
  const failure = new Error('encoder failed during discard');
  vi.mocked(session.recorders[0]!.artifactSession.stop).mockRejectedValue(failure);
  setActiveMultiSourceSession(session);
  await expect(
    stopMultiSourceSession({ discard: true, finalizeSession: vi.fn(), session })
  ).rejects.toBe(failure);
  expect(discard).toHaveBeenCalledOnce();
});
