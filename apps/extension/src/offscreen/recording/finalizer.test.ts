import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

// State-machine proof: failure/cancel/discard paths are terminal and notify stopped once.
const {
  loggerDebugMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  persistStaticFrameSignalsMock,
  saveRecordingSafelyMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  persistStaticFrameSignalsMock: vi.fn(),
  saveRecordingSafelyMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: loggerDebugMock,
      error: loggerErrorMock,
      info: loggerInfoMock,
      warn: loggerWarnMock,
    }),
  };
});

vi.mock('../../workflows/media-hub/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../workflows/media-hub/store')>();
  return {
    ...actual,
    saveRecordingSafely: saveRecordingSafelyMock,
  };
});

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/runtime-messaging/index')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

vi.mock('./signals/static-frame', () => ({
  persistStaticFrameSignals: persistStaticFrameSignalsMock,
}));

import { finalizeRecording, finalizeSidecarRecording } from './finalizer';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(12345);
});

async function verifyEmptyFinalizePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);

  await expect(finalizeRecording([], 'rec-empty')).resolves.toBeNull();

  expect(loggerWarnMock).toHaveBeenCalledWith('No recorded chunks to process');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
    recordingId: 'rec-empty',
  });
}

async function verifyStoppedNotificationFailuresStayLowNoise() {
  sendRuntimeMessageMock.mockRejectedValue(new Error('runtime unavailable'));

  await expect(finalizeRecording([], 'rec-1')).resolves.toBeNull();

  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime that recording stopped',
    expect.objectContaining({
      errorMessage: 'runtime unavailable',
      recordingId: 'rec-1',
      reason: 'no-recorded-chunks',
    })
  );
}

async function verifySuccessfulFinalizePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockResolvedValue(undefined);

  const result = await finalizeRecording(
    [new Blob(['video'], { type: 'video/webm' })],
    'rec-1',
    'video/webm;codecs=vp8,opus'
  );

  expect(result).toEqual({
    recordingId: 'rec-1',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-1',
    expect.any(Blob),
    expect.stringMatching(/^Sniptale-.*\.webm$/)
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'rec-1',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    recordingId: 'rec-1',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(persistStaticFrameSignalsMock).toHaveBeenCalledWith(
    'rec-1',
    expect.objectContaining({ type: 'video/webm;codecs=vp8,opus' })
  );
  expect(
    sendRuntimeMessageMock.mock.calls.findIndex(
      ([message]) => message.type === VideoMessageType.VIDEO_SAVED_TO_IDB
    )
  ).toBeLessThan(
    sendRuntimeMessageMock.mock.calls.findIndex(
      ([message]) => message.type === 'OFFSCREEN_RECORDING_STOPPED'
    )
  );
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-1',
    expect.objectContaining({ type: 'video/webm;codecs=vp8,opus' }),
    expect.stringMatching(/^Sniptale-.*\.webm$/)
  );
}

async function verifyMp4FinalizePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockResolvedValue(undefined);

  const result = await finalizeRecording(
    [new Blob(['video'], { type: 'video/mp4' })],
    'rec-mp4',
    'video/mp4'
  );

  expect(result).toEqual({
    recordingId: 'rec-mp4',
    filename: expect.stringMatching(/^Sniptale-.*\.mp4$/),
  });
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-mp4',
    expect.objectContaining({ type: 'video/mp4' }),
    expect.stringMatching(/^Sniptale-.*\.mp4$/)
  );
}

async function verifyFailedSavePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockRejectedValue(new Error('save failed'));

  await expect(finalizeRecording([new Blob(['video'])], null)).resolves.toBeNull();

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to save recording to media hub',
    expect.any(Error)
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
    recordingId: 'rec-12345',
  });
}

async function verifyDiscardedFinalizePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);

  await expect(
    finalizeRecording([new Blob(['video'])], 'rec-2', undefined, true)
  ).resolves.toBeNull();

  expect(persistStaticFrameSignalsMock).not.toHaveBeenCalled();
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
    recordingId: 'rec-2',
  });
}

async function verifySuppressedSavedNotificationPath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockResolvedValue(undefined);

  const result = await finalizeRecording([new Blob(['video'])], 'rec-3', 'video/webm', false, {
    notifySaved: false,
    notifyStopped: false,
  });

  expect(result).toEqual({
    recordingId: 'rec-3',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'rec-3',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.VIDEO_SAVED_TO_IDB })
  );
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
  });
}

async function verifySidecarFinalizePath() {
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockResolvedValue(undefined);

  const result = await finalizeSidecarRecording({
    chunks: [new Blob(['webcam'], { type: 'video/webm' })],
    discard: false,
    filenameSuffix: 'webcam',
    mimeType: 'video/webm',
    recordingId: 'rec-1-webcam',
  });

  expect(result).toEqual({
    recordingId: 'rec-1-webcam',
    filename: expect.stringMatching(/^Sniptale-.*-webcam\.webm$/),
  });
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-1-webcam',
    expect.objectContaining({ type: 'video/webm' }),
    expect.stringMatching(/^Sniptale-.*-webcam\.webm$/)
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'rec-1-webcam',
    filename: expect.stringMatching(/^Sniptale-.*-webcam\.webm$/),
  });
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.VIDEO_SAVED_TO_IDB,
      recordingId: 'rec-1-webcam',
    })
  );
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
  });
  expect(persistStaticFrameSignalsMock).not.toHaveBeenCalled();
}

async function verifySidecarDiscardPath() {
  await expect(
    finalizeSidecarRecording({
      chunks: [new Blob(['webcam'])],
      discard: true,
      filenameSuffix: 'webcam',
      recordingId: 'rec-1-webcam',
    })
  ).resolves.toBeNull();

  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
}

function runOffscreenFinalizerSuite() {
  it(
    'returns null and notifies the runtime when there are no recorded chunks',
    verifyEmptyFinalizePath
  );
  it(
    'keeps stop-notification failures as low-noise debug traces',
    verifyStoppedNotificationFailuresStayLowNoise
  );
  it('backs up, saves, and reports a finalized recording', verifySuccessfulFinalizePath);
  it('uses an mp4 filename for mp4 recorder output', verifyMp4FinalizePath);
  it('returns null when saving to the media hub fails', verifyFailedSavePath);
  it('skips persistence entirely when the recording is cancelled', verifyDiscardedFinalizePath);
  it(
    'can defer the saved notification for sidecar-aware finalization',
    verifySuppressedSavedNotificationPath
  );
  it(
    'backs up and saves webcam sidecar recordings without main-recording events',
    verifySidecarFinalizePath
  );
  it('skips webcam sidecar persistence on discard', verifySidecarDiscardPath);
}

describe('offscreen-finalizer', runOffscreenFinalizerSuite);
