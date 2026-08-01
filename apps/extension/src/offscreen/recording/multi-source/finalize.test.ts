import { beforeEach, expect, it, vi } from 'vitest';

import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { finalizeSession } from './finalize';
import {
  createMultiSourceLifecycle,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { saveRecordingSafelyMock, saveVideoProjectMock, sendRuntimeMessageMock } = vi.hoisted(
  () => ({
    saveRecordingSafelyMock: vi.fn(),
    saveVideoProjectMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProjectMock,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflows/media-hub/store')>();
  return {
    ...actual,
    saveRecordingSafely: saveRecordingSafelyMock,
  };
});

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/runtime-messaging')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  saveRecordingSafelyMock.mockResolvedValue(undefined);
  saveVideoProjectMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
});

it('uses each recorder container for artifact MIME, extension, and project metadata', async () => {
  await finalizeSession(createMixedContainerSession());

  expectContainerAwareRecordingWrites();
});

function createMixedContainerSession(): MultiSourceSession {
  return {
    ...createSession(),
    audioRecorder: createRecorder({
      chunks: [new Blob(['microphone'], { type: 'audio/webm' })],
      mimeType: 'audio/webm',
      recordingId: 'rec-mic',
      sourceIndex: 999,
      trackSettings: {},
    }),
    recorders: [
      createRecorder({
        chunks: [new Blob(['source'], { type: 'video/mp4' })],
        mimeType: 'video/mp4;codecs=avc1.640028',
        recordingId: 'rec-window-1',
        sourceIndex: 0,
        trackSettings: { height: 1080, width: 1920 },
      }),
      createRecorder({
        chunks: [new Blob(['source'], { type: 'video/webm' })],
        mimeType: 'video/webm;codecs=vp9',
        recordingId: 'rec-window-2',
        sourceIndex: 1,
        trackSettings: { height: 720, width: 1280 },
      }),
    ],
  };
}

function expectContainerAwareRecordingWrites() {
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-window-1',
    expect.objectContaining({ type: 'video/mp4' }),
    expect.stringContaining('window-1.mp4')
  );
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-window-2',
    expect.objectContaining({ type: 'video/webm' }),
    expect.stringContaining('window-2.webm')
  );
  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assets: expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            height: 1080,
            mimeType: 'video/mp4',
            width: 1920,
          }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ mimeType: 'video/webm' }),
          name: expect.stringContaining('window-2.webm'),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ hasAudio: true, mimeType: 'audio/webm' }),
          name: expect.stringContaining('microphone.webm'),
        }),
      ]),
    }),
    { baseRevision: null }
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-window-1' })
  );
}

it('notifies saved sessions with the base recording id when no sources were captured', async () => {
  await finalizeSession({
    ...createSession(),
    recorders: [],
    settings: { ...createSettings(), openEditorAfterRecording: false },
  });

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    recordingId: 'rec',
  });
});

it('rejects missing source dimensions before writing partial recording artifacts', async () => {
  await expect(
    finalizeSession({
      ...createSession(),
      recorders: [
        createRecorder({
          chunks: [new Blob(['source'], { type: 'video/webm' })],
          mimeType: 'video/webm;codecs=vp9',
          recordingId: 'rec-window-1',
          sourceIndex: 0,
          trackSettings: {},
        }),
      ],
    })
  ).rejects.toThrow('Multi-source recording dimensions are unavailable for source 1.');

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(saveVideoProjectMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamEnabled: false,
  };
}

function createSession(): MultiSourceSession {
  const lifecycle = createMultiSourceLifecycle();
  lifecycle.activate();
  return {
    audioRecorder: null,
    durationTimer: null,
    lifecycle,
    recorders: [],
    recordingId: 'rec',
    settings: createSettings(),
    startedAt: Date.now() - 1000,
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

function createMediaStreamFixture(): MediaStream {
  const eventTarget = new EventTarget();
  return {
    active: true,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    addTrack: () => undefined,
    clone: createMediaStreamFixture,
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    getAudioTracks: () => [],
    getTrackById: () => null,
    getTracks: () => [],
    getVideoTracks: () => [],
    id: 'media-stream-fixture',
    onaddtrack: null,
    onremovetrack: null,
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    removeTrack: () => undefined,
  };
}

function createRecorder(params: {
  chunks: Blob[];
  mimeType: string;
  recordingId: string;
  sourceIndex: number;
  trackSettings: MediaTrackSettings;
}): MultiSourceRecorder {
  return {
    chunks: params.chunks,
    label: null,
    recorder: { mimeType: params.mimeType } as MediaRecorder,
    recordingId: params.recordingId,
    sourceIndex: params.sourceIndex,
    stream: createMediaStreamFixture(),
    trackSettings: params.trackSettings,
  };
}
