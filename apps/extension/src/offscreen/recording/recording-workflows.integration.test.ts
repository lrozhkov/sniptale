import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createRecordingStagingCoordinatorTestDouble } from './encoding/artifact-session.test-support';
import { createRecordingArtifactSession } from './encoding/artifact-session';
import { finalizeRecording } from './finalizer';
import { finalizeSession } from './multi-source/finalize';
import { createMultiSourceLifecycle, type MultiSourceSession } from './multi-source/state';
import { setActiveMultiSourceSession } from './multi-source/state';
import { stopMultiSourceSession } from './multi-source/stop';
import { createTrackedStream } from './multi-source/media-stream.test-support';

const { commitProjectMock, notifySavedMock, notifyStoppedMock, saveBatchMock } = vi.hoisted(() => ({
  commitProjectMock: vi.fn(),
  notifySavedMock: vi.fn(),
  notifyStoppedMock: vi.fn(),
  saveBatchMock: vi.fn(),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveRecordingsBatchWithCompletionSafely: saveBatchMock,
}));
vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true, result: 'accepted' }),
}));
vi.mock('../../composition/persistence/recordings/completion-outbox', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/recordings/completion-outbox')
  >()),
  readVideoRecordingCompletionOutbox: vi.fn(async () => saveBatchMock.mock.lastCall?.[1]),
  removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
  updateVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./signals/static-frame', () => ({ persistStaticFrameSignals: vi.fn() }));
vi.mock('./multi-source/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./multi-source/messages')>()),
  notifyMultiSourceSaved: notifySavedMock,
  notifyMultiSourceStopped: notifyStoppedMock,
}));
vi.mock('../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: commitProjectMock,
}));
vi.mock('../../features/video/project/factories/multi-source-recording', async (original) => ({
  ...(await original<
    typeof import('../../features/video/project/factories/multi-source-recording')
  >()),
  createVideoProjectFromMultiSourceRecording: vi.fn(() => ({ id: 'project-integration' })),
}));

class TerminalMediaRecorder {
  mimeType = 'video/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state: RecordingState = 'inactive';
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

async function createStartedArtifact(params: {
  coordinator: ReturnType<typeof createRecordingStagingCoordinatorTestDouble>;
  filename: string;
  recordingId: string;
}) {
  const artifactSession = await createRecordingArtifactSession({
    artifactId: params.recordingId,
    coordinator: params.coordinator,
    filename: params.filename,
    mimeType: 'video/webm',
    recorderOptions: { mimeType: 'video/webm' },
    stream: createTrackedStream(),
  });
  artifactSession.start();
  return { artifactSession, recorder: artifactSession.recorder };
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', TerminalMediaRecorder);
  vi.clearAllMocks();
  saveBatchMock.mockResolvedValue(undefined);
  commitProjectMock.mockResolvedValue(undefined);
  notifySavedMock.mockResolvedValue(undefined);
  notifyStoppedMock.mockResolvedValue(undefined);
});

describe('recording staging workflow integration', () => {
  it('drains primary and sidecar terminal data into one batch before staging deletion', async () => {
    const staging = createRecordingStagingCoordinatorTestDouble();
    const primary = await createStartedArtifact({
      coordinator: staging,
      filename: 'primary.webm',
      recordingId: 'workflow-primary',
    });
    const webcam = await createStartedArtifact({
      coordinator: staging,
      filename: 'webcam.webm',
      recordingId: 'workflow-primary-webcam',
    });

    const artifacts = await Promise.all([
      primary.artifactSession.stop(),
      webcam.artifactSession.stop(),
    ]);
    await finalizeRecording({
      artifacts,
      discard: false,
      primaryRecordingId: 'workflow-primary',
      staging,
    });

    expect(saveBatchMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: 'workflow-primary' }),
        expect.objectContaining({ id: 'workflow-primary-webcam' }),
      ],
      {
        primaryRecordingId: 'workflow-primary',
        projectId: null,
        recordingId: 'workflow-primary',
      }
    );
    expect(saveBatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(staging.delete).mock.invocationCallOrder[0]!
    );
  });

  it('drains every multi-source artifact before atomic commit and aborts discard without commit', async () => {
    const staging = createRecordingStagingCoordinatorTestDouble();
    const first = await createStartedArtifact({
      coordinator: staging,
      filename: 'window-1.webm',
      recordingId: 'workflow-multi-window-1',
    });
    const second = await createStartedArtifact({
      coordinator: staging,
      filename: 'window-2.webm',
      recordingId: 'workflow-multi-window-2',
    });
    const lifecycle = createMultiSourceLifecycle();
    lifecycle.activate();
    const session: MultiSourceSession = {
      audioRecorder: null,
      durationTimer: null,
      lifecycle,
      recorders: [
        createMultiSourceRecorder('workflow-multi-window-1', 0, first),
        createMultiSourceRecorder('workflow-multi-window-2', 1, second),
      ],
      recordingId: 'workflow-multi',
      settings: DEFAULT_VIDEO_SETTINGS,
      staging,
      startedAt: Date.now() - 1_000,
      stopPromise: null,
      stopReject: null,
      stopResolve: null,
      webcamRecorder: null,
    };
    setActiveMultiSourceSession(session);

    await stopMultiSourceSession({ discard: false, finalizeSession, session });
    expect(saveBatchMock).toHaveBeenCalledOnce();
    expect(staging.delete).toHaveBeenCalledOnce();

    const discardStaging = createRecordingStagingCoordinatorTestDouble();
    const discarded = await createStartedArtifact({
      coordinator: discardStaging,
      filename: 'discard.webm',
      recordingId: 'workflow-discard-window-1',
    });
    const discardLifecycle = createMultiSourceLifecycle();
    discardLifecycle.activate();
    const discardSession: MultiSourceSession = {
      ...session,
      lifecycle: discardLifecycle,
      recorders: [createMultiSourceRecorder('workflow-discard-window-1', 0, discarded)],
      recordingId: 'workflow-discard',
      staging: discardStaging,
      stopPromise: null,
    };
    setActiveMultiSourceSession(discardSession);
    saveBatchMock.mockClear();

    await stopMultiSourceSession({ discard: true, finalizeSession, session: discardSession });
    expect(discardStaging.abort).toHaveBeenCalledOnce();
    expect(saveBatchMock).not.toHaveBeenCalled();
  });
});

function createMultiSourceRecorder(
  recordingId: string,
  sourceIndex: number,
  owner: Awaited<ReturnType<typeof createStartedArtifact>>
) {
  return {
    artifact: null,
    artifactSession: owner.artifactSession,
    label: `Window ${sourceIndex + 1}`,
    recorder: owner.recorder,
    recordingId,
    sourceIndex,
    stream: createTrackedStream(),
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  };
}
