// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createTrackedStream } from '../multi-source/media-stream.test-support';

const { normalizeMultiSourceVideoStreamMock } = vi.hoisted(() => ({
  normalizeMultiSourceVideoStreamMock: vi.fn(),
}));

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: normalizeMultiSourceVideoStreamMock,
}));

import { createWebcamSidecarRecorder } from './webcam';

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions
  ) {}
}

const stopOutputTrack = vi.fn();
const stopSourceTrack = vi.fn();

function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    webcamDeviceId: null,
    webcamEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  const sourceStream = createTrackedStream({ frameRate: 60, height: 720, width: 1280 });
  sourceStream.track.stop.mockImplementation(stopSourceTrack);
  const normalizedStream = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  normalizedStream.track.stop.mockImplementation(stopOutputTrack);
  normalizeMultiSourceVideoStreamMock.mockResolvedValue({
    dimensions: { height: 1080, width: 1920 },
    frameRate: 30,
    stream: normalizedStream,
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(sourceStream),
    },
  });
});

it('records the webcam through the fixed output stream', async () => {
  const settings = createSettings();
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    settings,
  });

  expect(normalizeMultiSourceVideoStreamMock).toHaveBeenCalledWith(expect.anything(), settings, {
    contentHint: 'motion',
    frameRate: 30,
  });
  expect(recorder?.recorder).toMatchObject({
    options: { videoBitsPerSecond: 6_000_000 },
    stream: recorder?.stream,
  });
  expect(recorder?.trackSettings).toEqual({ frameRate: 30, height: 1080, width: 1920 });
  expect(recorder?.recorder.onerror).not.toBeNull();
  expect(stopOutputTrack).not.toHaveBeenCalled();
  expect(stopSourceTrack).not.toHaveBeenCalled();
});

it('stops the normalized webcam stream when recorder creation owns a terminal error', async () => {
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    settings: createSettings(),
  });

  recorder?.recorder.onerror?.(new ErrorEvent('error'));

  expect(stopOutputTrack).toHaveBeenCalledOnce();
});
