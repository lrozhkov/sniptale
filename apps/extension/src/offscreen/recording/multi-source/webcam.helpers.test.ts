import { beforeEach, expect, it, vi } from 'vitest';

const { saveRecordingSafelyMock, triggerMultiSourceDownloadMock } = vi.hoisted(() => ({
  saveRecordingSafelyMock: vi.fn(),
  triggerMultiSourceDownloadMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflows/media-hub/store')>();
  return {
    ...actual,
    saveRecordingSafely: saveRecordingSafelyMock,
  };
});

vi.mock('./messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./messages')>();
  return {
    ...actual,
    triggerMultiSourceDownload: triggerMultiSourceDownloadMock,
  };
});

import type { RecordingSidecarRecorder } from '../sidecar/types';
import { createWebcamProjectInput, saveWebcamRecording, stopWebcamRecorderStream } from './webcam';

function createWebcamRecorder(overrides: Partial<RecordingSidecarRecorder> = {}) {
  return {
    chunks: [new Blob(['webcam'])],
    filenameSuffix: 'webcam',
    kind: 'webcam',
    recorder: { mimeType: '' } as MediaRecorder,
    recordingId: 'rec-webcam',
    stream: {} as MediaStream,
    trackSettings: {},
    ...overrides,
  } satisfies RecordingSidecarRecorder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects webcam artifacts when recorder and chunk MIME metadata are empty', async () => {
  await expect(saveWebcamRecording(createWebcamRecorder(), 3)).rejects.toThrow(
    'Unsupported recorded video MIME type: (empty)'
  );
  expect(saveRecordingSafelyMock).not.toHaveBeenCalled();
  expect(triggerMultiSourceDownloadMock).not.toHaveBeenCalled();
});

it('builds webcam project input from verified dimensions and preserves null passthrough', () => {
  expect(createWebcamProjectInput(null)).toBeNull();
  expect(
    createWebcamProjectInput({
      blob: new Blob(['webcam'], { type: 'video/webm' }),
      duration: 3,
      filename: 'webcam.webm',
      mimeType: 'video/webm',
      source: createWebcamRecorder({ trackSettings: { height: 720, width: 1280 } }),
    })
  ).toEqual({
    recordingId: 'rec-webcam',
    filename: 'webcam.webm',
    width: 1280,
    height: 720,
    duration: 3,
    mimeType: 'video/webm',
    size: 6,
  });
});

it('rejects webcam project input when recorded dimensions are unavailable', () => {
  expect(() =>
    createWebcamProjectInput({
      blob: new Blob(['webcam'], { type: 'video/webm' }),
      duration: 3,
      filename: 'webcam.webm',
      mimeType: 'video/webm',
      source: createWebcamRecorder(),
    })
  ).toThrow('Webcam recording dimensions are unavailable.');
});

it('stops webcam recorder streams when rollback owns a created recorder', () => {
  const stop = vi.fn();
  const recorder = createWebcamRecorder({
    stream: {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream,
  });

  stopWebcamRecorderStream(null);
  stopWebcamRecorderStream(recorder);

  expect(stop).toHaveBeenCalledOnce();
});
