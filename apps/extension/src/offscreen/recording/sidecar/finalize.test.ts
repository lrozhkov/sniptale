import { beforeEach, expect, it, vi } from 'vitest';

const { finalizeSidecarRecordingMock } = vi.hoisted(() => ({
  finalizeSidecarRecordingMock: vi.fn(),
}));

vi.mock('../finalizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../finalizer')>();
  return {
    ...actual,
    finalizeSidecarRecording: finalizeSidecarRecordingMock,
  };
});

import { finalizeActiveSidecarRecordings } from './finalize';
import { setActiveSidecarSession } from './state';
import type { RecordingSidecarRecorder } from './types';

function createSidecar(
  overrides: Partial<RecordingSidecarRecorder> = {}
): RecordingSidecarRecorder {
  return {
    chunks: [new Blob(['webcam'])],
    filenameSuffix: 'webcam',
    kind: 'webcam',
    recorder: { mimeType: 'video/webm' } as MediaRecorder,
    recordingId: 'rec-1-webcam',
    stream: {} as MediaStream,
    trackSettings: { height: 360, width: 640 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActiveSidecarSession(null);
});

it('does nothing when no sidecar session is active', async () => {
  await finalizeActiveSidecarRecordings(false);

  expect(finalizeSidecarRecordingMock).not.toHaveBeenCalled();
});

it('finalizes active sidecar recorders with stable save metadata', async () => {
  setActiveSidecarSession({
    recorders: [createSidecar()],
    stopPromise: null,
  });

  await finalizeActiveSidecarRecordings(false);

  expect(finalizeSidecarRecordingMock).toHaveBeenCalledWith({
    chunks: [expect.any(Blob)],
    discard: false,
    filenameSuffix: 'webcam',
    mimeType: 'video/webm',
    recordingId: 'rec-1-webcam',
  });
});
