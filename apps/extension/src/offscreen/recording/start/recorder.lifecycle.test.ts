import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import type { RecordingArtifactSession } from '../encoding/artifact-session';

const {
  buildVideoMediaRecorderOptionsMock,
  cleanupResourcesMock,
  createRecordingArtifactSessionMock,
  finalizeRecordingMock,
  getWebcamSettingsMock,
  sendRuntimeMessageMock,
  startSidecarsMock,
  stopSidecarsMock,
} = vi.hoisted(() => ({
  buildVideoMediaRecorderOptionsMock: vi.fn(),
  cleanupResourcesMock: vi.fn(),
  createRecordingArtifactSessionMock: vi.fn(),
  finalizeRecordingMock: vi.fn(),
  getWebcamSettingsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startSidecarsMock: vi.fn(),
  stopSidecarsMock: vi.fn(),
}));

vi.mock('../encoding/artifact-session', async (importOriginal) => {
  const original = await importOriginal<typeof import('../encoding/artifact-session')>();
  createRecordingArtifactSessionMock.mockImplementation(original.createRecordingArtifactSession);
  return {
    ...original,
    createRecordingArtifactSession: createRecordingArtifactSessionMock,
  };
});

vi.mock('../../../platform/media-utils/video-recording', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../platform/media-utils/video-recording')>();
  return {
    ...original,
    buildVideoMediaRecorderOptions: buildVideoMediaRecorderOptionsMock,
  };
});

vi.mock('../finalizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finalizer')>()),
  finalizeRecording: finalizeRecordingMock,
}));
vi.mock('../sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidecar')>()),
  getActiveSidecarVideoDimensions: vi.fn(() => []),
  getActiveSidecarWebcamSettings: getWebcamSettingsMock,
  startActiveSidecarRecorders: startSidecarsMock,
  stopActiveSidecarRecordersWithFlush: stopSidecarsMock,
}));
vi.mock('./cleanup', () => ({ cleanupResources: cleanupResourcesMock }));
vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
}));

import { recordingContext } from '../context';
import { PostRecordPublicationError } from '../post-record-publication';
import { finalizeRecordingBootstrap } from './recorder';

class MediaRecorderMock {
  static isTypeSupported = vi.fn(() => true);
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state: RecordingState = 'inactive';
  mimeType: string;

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

type RecordingLifecycleCallbacks = Parameters<RecordingArtifactSession['setLifecycleCallbacks']>[0];
const videoTrackEndedListeners = new Set<EventListenerOrEventListenerObject>();

function emitVideoTrackEnded(): void {
  const event = new Event('ended');
  videoTrackEndedListeners.forEach((listener) => {
    if (typeof listener === 'function') {
      listener(event);
    } else {
      listener.handleEvent(event);
    }
  });
}

function useControllableArtifactSession(options: { abortError?: Error } = {}) {
  const file = new File(['terminal'], 'recording.webm', { type: 'video/webm' });
  const artifact = {
    artifactId: 'recording-lifecycle',
    file,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };
  const recorder = new MediaRecorderMock(createVideoStream(), { mimeType: 'video/webm' });
  let callbacks: RecordingLifecycleCallbacks = {};
  const artifactSession: RecordingArtifactSession = {
    abort: options.abortError
      ? vi.fn().mockRejectedValue(options.abortError)
      : vi.fn().mockResolvedValue(undefined),
    recorder: recorder as unknown as MediaRecorder,
    setLifecycleCallbacks: vi.fn((next: RecordingLifecycleCallbacks) => {
      callbacks = next;
    }),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(artifact),
  };
  createRecordingArtifactSessionMock.mockResolvedValueOnce(artifactSession);
  return {
    artifact,
    artifactSession,
    getCallbacks: () => callbacks,
  };
}

function createVideoStream(): MediaStream {
  const track = {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') videoTrackEndedListeners.add(listener);
    }),
    getSettings: () => ({ frameRate: 30, height: 720, width: 1280 }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') videoTrackEndedListeners.delete(listener);
    }),
    stop: vi.fn(),
  };
  return {
    getAudioTracks: () => [],
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

async function bootstrap(): Promise<void> {
  recordingContext.beginRecordingSession('recording-lifecycle');
  recordingContext.videoStream = createVideoStream();
  recordingContext.sourceStream = recordingContext.videoStream;
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  await finalizeRecordingBootstrap({
    durationTracker: recordingContext.durationTracker,
    resolvedRecordingId: 'recording-lifecycle',
    settings: DEFAULT_VIDEO_SETTINGS,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  });
}

async function bootstrapControllable(
  params: {
    abortError?: Error;
    cursorCaptureMode?: 'embedded-fallback' | 'separate' | null;
    displaySurface?: string;
    omitSourceStream?: boolean;
    webcamSettings?: { frameRate: number; height: number; width: number };
  } = {}
) {
  const fixture = useControllableArtifactSession({
    ...(params.abortError === undefined ? {} : { abortError: params.abortError }),
  });
  recordingContext.beginRecordingSession('recording-lifecycle');
  recordingContext.videoStream = createVideoStream();
  recordingContext.sourceStream = params.omitSourceStream ? null : recordingContext.videoStream;
  recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
  getWebcamSettingsMock.mockReturnValueOnce(params.webcamSettings ?? null);
  await finalizeRecordingBootstrap({
    ...(params.cursorCaptureMode === undefined
      ? {}
      : { cursorCaptureMode: params.cursorCaptureMode }),
    durationTracker: recordingContext.durationTracker,
    resolvedRecordingId: 'recording-lifecycle',
    settings: DEFAULT_VIDEO_SETTINGS,
    trackSettings: {
      frameRate: 30,
      height: 720,
      width: 1280,
      ...(params.displaySurface === undefined ? {} : { displaySurface: params.displaySurface }),
    },
  });
  return fixture;
}

beforeEach(() => {
  vi.clearAllMocks();
  videoTrackEndedListeners.clear();
  buildVideoMediaRecorderOptionsMock.mockReturnValue({
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 8_000_000,
  });
  vi.stubGlobal('MediaRecorder', MediaRecorderMock);
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  finalizeRecordingMock.mockResolvedValue({
    filename: 'recording.webm',
    recordingId: 'recording-lifecycle',
  });
  stopSidecarsMock.mockResolvedValue([]);
  getWebcamSettingsMock.mockReturnValue(null);
});

describe('primary recording artifact lifecycle', () => {
  it('publishes started only after the artifact recorder starts', async () => {
    await bootstrap();
    expect(recordingContext.lifecycleState).toBe('recording');
    expect(startSidecarsMock).toHaveBeenCalledWith(expect.any(Function));
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );
  });

  it('ignores a duplicate onStart after activating the bound recorder', async () => {
    const fixture = await bootstrapControllable();
    const callbacks = fixture.getCallbacks();

    callbacks.onStart?.();
    callbacks.onStart?.();

    expect(recordingContext.lifecycleState).toBe('recording');
    expect(startSidecarsMock).toHaveBeenCalledOnce();
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([input]) => input.payload.type === 'OFFSCREEN_RECORDING_STARTED'
      )
    ).toHaveLength(1);
  });

  it('does not activate when sidecar startup terminalizes the recorder', async () => {
    startSidecarsMock.mockImplementationOnce((onUnexpectedFailure: (error: Error) => void) => {
      onUnexpectedFailure(new Error('sidecar failed during start'));
    });
    const fixture = await bootstrapControllable();

    fixture.getCallbacks().onStart?.();

    expect(recordingContext.lifecycleState).toBe('starting');
    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_RECORDING_STARTED' }),
      })
    );
  });

  it('reports an unexpected stop before the encoder starts', async () => {
    const fixture = await bootstrapControllable();

    await fixture.getCallbacks().onStop?.(fixture.artifact);

    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'The recording stopped before the encoder started.',
          phase: 'start',
        }),
      })
    );
  });

  it('surfaces a source end during bootstrap as a start failure without finalizing media', async () => {
    const fixture = await bootstrapControllable();

    emitVideoTrackEnded();

    expect(fixture.artifactSession.stop).not.toHaveBeenCalled();
    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'The recording source ended before the encoder started.',
          phase: 'start',
        }),
      })
    );
  });

  it('reports an unexpected stop after the encoder starts', async () => {
    const fixture = await bootstrapControllable();
    fixture.getCallbacks().onStart?.();
    cleanupResourcesMock.mockClear();
    sendRuntimeMessageMock.mockClear();

    await fixture.getCallbacks().onStop?.(fixture.artifact);

    expect(cleanupResourcesMock).toHaveBeenCalledOnce();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'The recording stopped unexpectedly.',
          phase: 'runtime',
        }),
      })
    );
  });

  it('settles a bound stop failure once even when failure is replayed', async () => {
    const fixture = await bootstrapControllable();
    const resolve = vi.fn();
    const reject = vi.fn();
    recordingContext.beginStopRequest({ reject, resolve });

    fixture.getCallbacks().onFailure?.(new Error('encoder stop failed'));
    fixture.getCallbacks().onFailure?.(new Error('duplicate encoder failure'));

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({
      error: 'encoder stop failed',
      result: 'terminal-failure',
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it('rejects a bound stop failure when no resolve channel remains', async () => {
    const fixture = await bootstrapControllable();
    const reject = vi.fn();
    recordingContext.beginStopRequest({ reject, resolve: vi.fn() });
    recordingContext.stopRecordingResolve = null;
    const error = new Error('encoder stop failed');

    fixture.getCallbacks().onFailure?.(error);

    expect(reject).toHaveBeenCalledWith(error);
  });

  it('absorbs a rejected artifact abort during starting-recorder cancellation', async () => {
    const fixture = await bootstrapControllable({ abortError: new Error('abort failed') });

    expect(recordingContext.cancelStartingRecorder()).toBe(true);
    await Promise.resolve();
    await fixture.getCallbacks().onStop?.(fixture.artifact);

    expect(fixture.artifactSession.abort).toHaveBeenCalledOnce();
    expect(finalizeRecordingMock).not.toHaveBeenCalled();
  });

  it.each([VideoDisplaySurface.BROWSER, VideoDisplaySurface.MONITOR])(
    'publishes validated %s surface and webcam metadata without a cursor mode',
    async (displaySurface) => {
      const webcamSettings = { frameRate: 30, height: 720, width: 1280 };
      const fixture = await bootstrapControllable({
        cursorCaptureMode: null,
        displaySurface,
        omitSourceStream: true,
        webcamSettings,
      });

      fixture.getCallbacks().onStart?.();

      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            type: 'OFFSCREEN_RECORDING_STARTED',
            displaySurface,
            recordingId: 'recording-lifecycle',
            webcamSettings,
          },
        })
      );
    }
  );
});

describe('primary recording stop finalization', () => {
  it('turns an active source end into one saved terminal artifact', async () => {
    const fixture = await bootstrapControllable();
    fixture.getCallbacks().onStart?.();
    cleanupResourcesMock.mockClear();
    sendRuntimeMessageMock.mockClear();

    emitVideoTrackEnded();

    expect(recordingContext.lifecycleState).toBe('stopping');
    expect(fixture.artifactSession.stop).toHaveBeenCalledOnce();
    await fixture.getCallbacks().onStop?.(fixture.artifact);
    expect(finalizeRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ discard: false, primaryRecordingId: 'recording-lifecycle' })
    );
    expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ type: 'OFFSCREEN_ERROR' }),
      })
    );
  });

  it('drains terminal media before atomic finalization resolves the stop', async () => {
    await bootstrap();
    const resolve = vi.fn();
    recordingContext.beginStopRequest({ reject: vi.fn(), resolve });

    await recordingContext.artifactSession?.stop();

    expect(finalizeRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artifacts: [expect.objectContaining({ artifactId: 'recording-lifecycle', size: 17 })],
        primaryRecordingId: 'recording-lifecycle',
      })
    );
    expect(resolve).toHaveBeenCalledWith({ result: 'stopped' });
  });
});

describe('primary recording bootstrap validation', () => {
  it('rejects bootstrap when the recording stream is unavailable', async () => {
    recordingContext.beginRecordingSession('recording-lifecycle');
    await expect(
      finalizeRecordingBootstrap({
        durationTracker: recordingContext.durationTracker,
        resolvedRecordingId: 'recording-lifecycle',
        settings: DEFAULT_VIDEO_SETTINGS,
        trackSettings: { frameRate: 30, height: 720, width: 1280 },
      })
    ).rejects.toThrow('Recording video stream is not initialized');
  });

  it('rejects bootstrap when recording staging is unavailable', async () => {
    recordingContext.beginRecordingSession('recording-lifecycle');
    recordingContext.videoStream = createVideoStream();

    await expect(
      finalizeRecordingBootstrap({
        durationTracker: recordingContext.durationTracker,
        resolvedRecordingId: 'recording-lifecycle',
        settings: DEFAULT_VIDEO_SETTINGS,
        trackSettings: { frameRate: 30, height: 720, width: 1280 },
      })
    ).rejects.toThrow('Recording staging is not initialized');
  });

  it.each([
    { height: 720 },
    { width: 1280 },
    { height: 720, width: 1.5 },
    { height: 1.5, width: 1280 },
    { height: 720, width: 0 },
    { height: 0, width: 1280 },
  ] satisfies MediaTrackSettings[])(
    'rejects unavailable primary output dimensions %#',
    async (trackSettings) => {
      recordingContext.beginRecordingSession('recording-lifecycle');
      recordingContext.videoStream = createVideoStream();
      recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());

      await expect(
        finalizeRecordingBootstrap({
          durationTracker: recordingContext.durationTracker,
          resolvedRecordingId: 'recording-lifecycle',
          settings: DEFAULT_VIDEO_SETTINGS,
          trackSettings,
        })
      ).rejects.toThrow('Recording output dimensions are unavailable');
    }
  );

  it('rejects bootstrap when recorder options omit a MIME type', async () => {
    recordingContext.beginRecordingSession('recording-lifecycle');
    recordingContext.videoStream = createVideoStream();
    recordingContext.bindStagingCoordinator(createRecordingStagingCoordinatorTestDouble());
    buildVideoMediaRecorderOptionsMock.mockReturnValueOnce({ videoBitsPerSecond: 8_000_000 });

    await expect(
      finalizeRecordingBootstrap({
        durationTracker: recordingContext.durationTracker,
        resolvedRecordingId: 'recording-lifecycle',
        settings: DEFAULT_VIDEO_SETTINGS,
        trackSettings: { frameRate: 30, height: 720, width: 1280 },
      })
    ).rejects.toThrow('Unsupported recorded video MIME type: (empty)');
  });
});

describe('primary recording terminal failure publication', () => {
  it('preserves a source-ended finalization failure for a joining background STOP', async () => {
    const finalizationError = new Error('durable publication failed');
    finalizeRecordingMock.mockRejectedValueOnce(finalizationError);
    await bootstrap();
    const artifactSession = recordingContext.artifactSession;
    expect(artifactSession).not.toBeNull();

    emitVideoTrackEnded();

    await expect(artifactSession?.stop()).rejects.toBe(finalizationError);
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          error: finalizationError.message,
          phase: 'runtime',
          type: 'OFFSCREEN_ERROR',
        }),
      })
    );
  });

  it('surfaces missing staging as a terminal stop failure', async () => {
    await bootstrap();
    const resolve = vi.fn();
    recordingContext.beginStopRequest({ reject: vi.fn(), resolve });
    recordingContext.stagingCoordinator = null;

    await expect(recordingContext.artifactSession?.stop()).rejects.toThrow(
      'Recording staging is unavailable during stop.'
    );

    expect(finalizeRecordingMock).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({
      error: 'Recording staging is unavailable during stop.',
      result: 'terminal-failure',
    });
  });

  it('rejects terminal finalization when its resolve channel is unavailable', async () => {
    await bootstrap();
    const reject = vi.fn();
    recordingContext.beginStopRequest({ reject, resolve: vi.fn() });
    recordingContext.stopRecordingResolve = null;
    recordingContext.stagingCoordinator = null;

    await expect(recordingContext.artifactSession?.stop()).rejects.toThrow(
      'Recording staging is unavailable during stop.'
    );

    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Recording staging is unavailable during stop.' })
    );
  });

  it('rejects the bound stop when post-record publication remains recoverable', async () => {
    const publicationError = new PostRecordPublicationError(
      {
        primaryRecordingId: 'recording-lifecycle',
        projectId: null,
        recordingId: 'recording-lifecycle',
      },
      new Error('background did not acknowledge publication')
    );
    finalizeRecordingMock.mockRejectedValueOnce(publicationError);
    await bootstrap();
    const reject = vi.fn();
    recordingContext.beginStopRequest({ reject, resolve: vi.fn() });

    await expect(recordingContext.artifactSession?.stop()).rejects.toBe(publicationError);

    expect(reject).toHaveBeenCalledWith(publicationError);
  });
});
