import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createPreparedRecordingAssetForTest } from '../../../composition/persistence/recordings/staging/test-support';
import type { LiveRecordingArtifactSession } from '../encoding/live-artifact-session';

const { createLiveRecordingArtifactSessionMock, finalizeRecordingMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    createLiveRecordingArtifactSessionMock: vi.fn(),
    finalizeRecordingMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../encoding/live-artifact-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../encoding/live-artifact-session')>()),
  createLiveRecordingArtifactSession: createLiveRecordingArtifactSessionMock,
}));

vi.mock('../finalizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finalizer')>()),
  finalizeRecording: finalizeRecordingMock,
}));
vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
}));

import { recordingContext } from '../context';
import { finalizeRecordingBootstrap } from './recorder';

class TerminalMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state: RecordingState = 'inactive';

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? '';
  }

  requestData = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['requested']) } as BlobEvent);
  });
  start = vi.fn(() => {
    this.state = 'recording';
    this.onstart?.(new Event('start'));
  });
  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['terminal']) } as BlobEvent);
    this.state = 'inactive';
    this.onstop?.(new Event('stop'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', TerminalMediaRecorder);
  recordingContext.resetRecordingSession();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  createLiveRecordingArtifactSessionMock.mockImplementation(async (input) => {
    let callbacks: Parameters<LiveRecordingArtifactSession['setLifecycleCallbacks']>[0] = {};
    let state: RecordingState = 'inactive';
    const artifact = {
      artifactId: 'recording-failure',
      asset: createPreparedRecordingAssetForTest(
        new File(['x'], 'recording.webm', { type: 'video/webm' }),
        'recording-failure'
      ),
      filename: 'recording.webm',
      mimeType: 'video/webm',
      size: 1,
    };
    let terminal: Promise<typeof artifact> | null = null;
    return {
      abort: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setLifecycleCallbacks: vi.fn((next) => {
        callbacks = next;
      }),
      start: vi.fn(() => {
        state = 'recording';
        callbacks.onStart?.();
      }),
      get state() {
        return state;
      },
      stop: vi.fn(() => {
        terminal ??= (async () => {
          state = 'inactive';
          try {
            await callbacks.onStop?.(artifact);
            return artifact;
          } catch (error) {
            await input.coordinator.abort();
            callbacks.onFailure?.(error as Error);
            throw error;
          }
        })();
        return terminal;
      }),
    };
  });
});

it('keeps the exact source-ended finalization failure after real shared cleanup', async () => {
  const finalizationError = new Error('durable publication failed');
  finalizeRecordingMock.mockRejectedValueOnce(finalizationError);
  const stream = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const staging = createRecordingStagingCoordinatorTestDouble();
  recordingContext.beginRecordingSession('recording-failure');
  recordingContext.sourceStream = stream;
  recordingContext.videoStream = stream;
  recordingContext.bindStagingCoordinator(staging);
  await finalizeRecordingBootstrap({
    durationTracker: recordingContext.durationTracker,
    resolvedRecordingId: 'recording-failure',
    settings: DEFAULT_VIDEO_SETTINGS,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  const artifactSession = recordingContext.artifactSession;
  expect(artifactSession).not.toBeNull();

  stream.track.dispatchEvent(new Event('ended'));

  await expect(artifactSession?.stop()).rejects.toBe(finalizationError);
  expect(staging.abort).toHaveBeenCalledOnce();
  expect(recordingContext.lifecycleState).toBe('idle');
});

it('honors explicit discard during encoder failure through real shared cleanup', async () => {
  const stream = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const staging = createRecordingStagingCoordinatorTestDouble();
  const discard = vi.fn().mockResolvedValue(undefined);
  staging.discard = discard;
  recordingContext.beginRecordingSession('recording-failure');
  recordingContext.sourceStream = stream;
  recordingContext.videoStream = stream;
  recordingContext.bindStagingCoordinator(staging);
  await finalizeRecordingBootstrap({
    durationTracker: recordingContext.durationTracker,
    resolvedRecordingId: 'recording-failure',
    settings: DEFAULT_VIDEO_SETTINGS,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  const session = recordingContext.artifactSession!;
  const callbacks = vi.mocked(session.setLifecycleCallbacks).mock.lastCall![0];
  recordingContext.beginStopRequest({ discard: true, reject: vi.fn(), resolve: vi.fn() });
  callbacks.onFailure?.(new Error('encoder failed while discarding'));
  await vi.waitFor(() => expect(discard).toHaveBeenCalledOnce());
  expect(recordingContext.lifecycleState).toBe('idle');
});

it('releases resources and settles stop if both finalization and explicit discard fail', async () => {
  finalizeRecordingMock.mockRejectedValueOnce(new Error('publication failed'));
  const stream = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const staging = createRecordingStagingCoordinatorTestDouble();
  staging.discard = vi.fn().mockRejectedValue(new Error('discard failed'));
  recordingContext.beginRecordingSession('recording-failure');
  recordingContext.sourceStream = stream;
  recordingContext.videoStream = stream;
  recordingContext.bindStagingCoordinator(staging);
  await finalizeRecordingBootstrap({
    durationTracker: recordingContext.durationTracker,
    resolvedRecordingId: 'recording-failure',
    settings: DEFAULT_VIDEO_SETTINGS,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  const session = recordingContext.artifactSession!;
  const resolve = vi.fn();
  recordingContext.beginStopRequest({ discard: true, reject: vi.fn(), resolve });
  await expect(session.stop()).rejects.toThrow('finalization and explicit discard failed');
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ result: 'terminal-failure' }));
  expect(recordingContext.lifecycleState).toBe('idle');
  expect(stream.track.stop).toHaveBeenCalled();
});
