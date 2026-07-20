import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const { saveRecordingSafelyMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  saveRecordingSafelyMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveRecordingSafely: saveRecordingSafelyMock,
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('./signals/static-frame', () => ({
  persistStaticFrameSignals: vi.fn(),
}));

import { finalizeRecording, finalizeSidecarRecording } from './finalizer';

beforeEach(() => {
  vi.clearAllMocks();
  saveRecordingSafelyMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it('ignores repeated main recording finalization for the same recording id', async () => {
  const first = await finalizeRecording([new Blob(['video'])], 'rec-replay-main');
  const second = await finalizeRecording([new Blob(['video-again'])], 'rec-replay-main');

  expect(first).toEqual({
    recordingId: 'rec-replay-main',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
  expect(second).toBeNull();
  expect(saveRecordingSafelyMock).toHaveBeenCalledOnce();
  expect(
    sendRuntimeMessageMock.mock.calls.filter(
      ([message]) => message.type === VideoMessageType.VIDEO_SAVED_TO_IDB
    )
  ).toHaveLength(1);
});

it('ignores concurrent main recording finalization for the same recording id', async () => {
  const save = createDeferred();
  saveRecordingSafelyMock.mockReturnValueOnce(save.promise);

  const first = finalizeRecording([new Blob(['video'])], 'rec-replay-in-flight');
  await Promise.resolve();
  const second = await finalizeRecording([new Blob(['video-again'])], 'rec-replay-in-flight');

  expect(second).toBeNull();
  expect(saveRecordingSafelyMock).toHaveBeenCalledOnce();

  save.resolve();
  await expect(first).resolves.toEqual({
    recordingId: 'rec-replay-in-flight',
    filename: expect.stringMatching(/^Sniptale-.*\.webm$/),
  });
});

it('ignores repeated sidecar finalization for the same recording id', async () => {
  const first = await finalizeSidecarRecording({
    chunks: [new Blob(['webcam'])],
    discard: false,
    filenameSuffix: 'webcam',
    recordingId: 'rec-replay-webcam',
  });
  const second = await finalizeSidecarRecording({
    chunks: [new Blob(['webcam-again'])],
    discard: false,
    filenameSuffix: 'webcam',
    recordingId: 'rec-replay-webcam',
  });

  expect(first).toEqual({
    recordingId: 'rec-replay-webcam',
    filename: expect.stringMatching(/^Sniptale-.*-webcam\.webm$/),
  });
  expect(second).toBeNull();
  expect(saveRecordingSafelyMock).toHaveBeenCalledOnce();
});
