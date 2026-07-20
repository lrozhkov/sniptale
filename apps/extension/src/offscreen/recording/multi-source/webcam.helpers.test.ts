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

it('saves webcam recordings with video defaults for empty recorder metadata', async () => {
  const result = await saveWebcamRecording(createWebcamRecorder(), 3);

  expect(result.mimeType).toBe('video/webm');
  expect(saveRecordingSafelyMock).toHaveBeenCalledWith(
    'rec-webcam',
    expect.objectContaining({ type: 'video/webm' }),
    expect.stringContaining('webcam.webm')
  );
  expect(triggerMultiSourceDownloadMock).toHaveBeenCalledWith(
    'rec-webcam',
    expect.stringContaining('webcam.webm')
  );
});

it('builds webcam project input with default dimensions and null passthrough', () => {
  expect(createWebcamProjectInput(null)).toBeNull();
  expect(
    createWebcamProjectInput({
      blob: new Blob(['webcam'], { type: 'video/webm' }),
      duration: 3,
      filename: 'webcam.webm',
      mimeType: 'video/webm',
      source: createWebcamRecorder(),
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
