import { beforeEach, expect, it, vi } from 'vitest';

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { finalizeSession } from './finalize';
import type { MultiSourceRecorder, MultiSourceSession } from './state';

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

it('falls back to chunk/default mime types and default source dimensions', async () => {
  await finalizeSession(createFallbackMimeSession());

  expectFallbackRecordingWrites();
});

function createFallbackMimeSession(): MultiSourceSession {
  return {
    ...createSession(),
    audioRecorder: createRecorder({
      chunks: [],
      recordingId: 'rec-mic',
      sourceIndex: 999,
      trackSettings: {},
    }),
    recorders: [
      createRecorder({
        chunks: [new Blob(['source'], { type: 'video/custom' })],
        recordingId: 'rec-window-1',
        sourceIndex: 0,
        trackSettings: {},
      }),
      createRecorder({
        chunks: [],
        recordingId: 'rec-window-2',
        sourceIndex: 1,
        trackSettings: {},
      }),
    ],
  };
}

function expectFallbackRecordingWrites() {
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-window-1',
    expect.any(Blob),
    expect.stringContaining('window-1.webm')
  );
  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assets: expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            height: 1080,
            mimeType: 'video/custom',
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

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamEnabled: false,
  };
}

function createSession(): MultiSourceSession {
  return {
    audioRecorder: null,
    durationTimer: null,
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
  recordingId: string;
  sourceIndex: number;
  trackSettings: MediaTrackSettings;
}): MultiSourceRecorder {
  return {
    chunks: params.chunks,
    label: null,
    recorder: { mimeType: '' } as MediaRecorder,
    recordingId: params.recordingId,
    sourceIndex: params.sourceIndex,
    stream: createMediaStreamFixture(),
    trackSettings: params.trackSettings,
  };
}
