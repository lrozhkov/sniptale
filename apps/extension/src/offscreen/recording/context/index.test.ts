import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerDebugMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

import { recordingContext } from '.';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function resetRecordingContextForTest() {
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
  recordingContext.videoStream = null;
  recordingContext.sourceStream = null;
  recordingContext.audioMixer = null;
  recordingContext.durationTracker.reset();
}

function expectEmptyRecordingState() {
  expect(recordingContext.mediaRecorder).toBeNull();
  expect(recordingContext.videoStream).toBeNull();
  expect(recordingContext.sourceStream).toBeNull();
  expect(recordingContext.audioMixer).toBeNull();
  expect(recordingContext.recordedChunks).toEqual([]);
  expect(recordingContext.currentRecordingId).toBeNull();
  expect(recordingContext.lifecycleState).toBe('idle');
  expect(recordingContext.viewportDrawFrozen).toBe(false);
  expect(recordingContext.viewportNavigationEpoch).toBe(0);
  expect(recordingContext.updateViewportPresetCrop).toBeNull();
}

function verifyLifecycleOwnerApi() {
  const mediaRecorder = { state: 'inactive' } as MediaRecorder;

  recordingContext.beginRecordingSession('recording-1');
  expect(recordingContext.lifecycleState).toBe('starting');
  expect(recordingContext.currentRecordingId).toBe('recording-1');

  recordingContext.activateRecorder(mediaRecorder);
  expect(recordingContext.lifecycleState).toBe('recording');
  expect(recordingContext.mediaRecorder).toBe(mediaRecorder);

  recordingContext.beginStopRequest({
    reject: vi.fn(),
    resolve: vi.fn(),
  });
  expect(recordingContext.lifecycleState).toBe('stopping');

  recordingContext.resetRecordingSession();
  expect(recordingContext.lifecycleState).toBe('idle');
  expect(recordingContext.currentRecordingId).toBeNull();
}

function verifyIllegalLifecycleTransition() {
  expect(() =>
    recordingContext.beginStopRequest({
      reject: vi.fn(),
      resolve: vi.fn(),
    })
  ).toThrow('Illegal recording lifecycle transition: idle -> stopping');
}

describe('offscreen-recording-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecordingContextForTest();
    sendRuntimeMessageMock.mockResolvedValue(undefined);
  });

  it('starts with empty mutable recording state', () => {
    expectEmptyRecordingState();
  });

  it('tracks legal recording lifecycle transitions through the owner API', verifyLifecycleOwnerApi);

  it(
    'rejects illegal lifecycle transitions before a recording session is initialized',
    verifyIllegalLifecycleTransition
  );

  it('tracks discard-aware stop requests and clears their handlers explicitly', () => {
    const resolve = vi.fn();
    const reject = vi.fn();

    recordingContext.beginRecordingSession('recording-1');
    recordingContext.activateRecorder({ state: 'recording' } as MediaRecorder);
    recordingContext.beginStopRequest({ discard: true, resolve, reject });

    expect(recordingContext.discardOnStop).toBe(true);
    expect(recordingContext.clearStopRequest()).toEqual({ resolve, reject });
    expect(recordingContext.stopRecordingResolve).toBeNull();
    expect(recordingContext.stopRecordingReject).toBeNull();
  });

  it('treats lifecycle and active media resources as recording-session ownership signals', () => {
    expect(recordingContext.hasActiveRecordingSession()).toBe(false);

    recordingContext.sourceStream = {} as MediaStream;
    expect(recordingContext.hasActiveRecordingSession()).toBe(true);

    recordingContext.sourceStream = null;
    recordingContext.beginRecordingSession('recording-2');
    expect(recordingContext.hasActiveRecordingSession()).toBe(true);

    recordingContext.resetRecordingSession();
    expect(recordingContext.hasActiveRecordingSession()).toBe(false);
  });

  it('publishes duration updates through the shared runtime transport', async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));
    recordingContext.beginRecordingSession('rec-1');

    recordingContext.durationTracker.publishDuration();
    await flushPromises();

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: VideoMessageType.RECORDING_DURATION_UPDATED,
      duration: 0,
      recordingId: 'rec-1',
    });
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Failed to publish recording duration update',
      expect.objectContaining({
        duration: 0,
        errorMessage: 'popup closed',
        recordingId: 'rec-1',
      })
    );
  });
});
