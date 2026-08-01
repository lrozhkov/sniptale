import { beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  createMultiSourceLifecycle,
  setActiveMultiSourceSession,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import { stopMultiSourceSession } from './stop';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

type FakeRecorder = {
  onstop: (() => void) | null;
  requestData: ReturnType<typeof vi.fn>;
  state: RecordingState;
  stop: ReturnType<typeof vi.fn>;
};

function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
  };
}

function createRecorder(sourceIndex: number): MultiSourceRecorder & { fakeRecorder: FakeRecorder } {
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const fakeRecorder: FakeRecorder = {
    onstop: null,
    requestData: vi.fn(),
    state: 'recording',
    stop: vi.fn(() => {
      fakeRecorder.state = 'inactive';
    }),
  };
  return {
    chunks: [],
    fakeRecorder,
    label: null,
    recorder: fakeRecorder as unknown as MediaRecorder,
    recordingId: `rec-window-${sourceIndex + 1}`,
    sourceIndex,
    stream,
    trackSettings: { height: 720, width: 1280 },
  };
}

function createSession(recorders: MultiSourceRecorder[]): MultiSourceSession {
  const lifecycle = createMultiSourceLifecycle();
  lifecycle.activate();
  return {
    audioRecorder: null,
    durationTimer: null,
    lifecycle,
    recorders,
    recordingId: 'rec',
    settings: createSettings(),
    startedAt: Date.now(),
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

function createWebcamRecorder(): RecordingSidecarRecorder & { fakeRecorder: FakeRecorder } {
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const fakeRecorder: FakeRecorder = {
    onstop: null,
    requestData: vi.fn(),
    state: 'recording',
    stop: vi.fn(() => {
      fakeRecorder.state = 'inactive';
    }),
  };
  return {
    chunks: [],
    fakeRecorder,
    filenameSuffix: 'webcam',
    kind: 'webcam',
    recorder: fakeRecorder as unknown as MediaRecorder,
    recordingId: 'rec-webcam',
    stream,
    trackSettings: { height: 360, width: 640 },
  };
}

beforeEach(() => {
  setActiveMultiSourceSession(null);
});

it('deduplicates overlapping stop requests and finalizes a source batch once', async () => {
  const recorders = [createRecorder(0), createRecorder(1)];
  const session = createSession(recorders);
  const finalizeSession = vi.fn().mockResolvedValue(undefined);

  setActiveMultiSourceSession(session);
  const firstStop = stopMultiSourceSession({ discard: false, finalizeSession, session });
  const secondStop = stopMultiSourceSession({ discard: false, finalizeSession, session });

  expect(firstStop).toBe(secondStop);
  recorders.forEach((source) => {
    expect(source.fakeRecorder.requestData).toHaveBeenCalledOnce();
    expect(source.fakeRecorder.stop).toHaveBeenCalledOnce();
  });
  expect(finalizeSession).not.toHaveBeenCalled();

  recorders[0]?.fakeRecorder.onstop?.();
  recorders[1]?.fakeRecorder.onstop?.();
  recorders[1]?.fakeRecorder.onstop?.();
  await Promise.all([firstStop, secondStop]);

  expect(finalizeSession).toHaveBeenCalledOnce();
  expect(finalizeSession).toHaveBeenCalledWith(session);
});

it('waits for webcam recorder stop before finalizing the session', async () => {
  const recorders = [createRecorder(0), createRecorder(1)];
  const webcamRecorder = createWebcamRecorder();
  const session = { ...createSession(recorders), webcamRecorder };
  const finalizeSession = vi.fn().mockResolvedValue(undefined);

  setActiveMultiSourceSession(session);
  const stopPromise = stopMultiSourceSession({ discard: false, finalizeSession, session });

  recorders.forEach((source) => source.fakeRecorder.onstop?.());
  await Promise.resolve();
  expect(finalizeSession).not.toHaveBeenCalled();

  webcamRecorder.fakeRecorder.onstop?.();
  await stopPromise;

  expect(webcamRecorder.fakeRecorder.requestData).toHaveBeenCalledOnce();
  expect(finalizeSession).toHaveBeenCalledWith(session);
});
