// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';

const { buildVideoMediaRecorderOptionsMock, normalizeMultiSourceVideoStreamMock } = vi.hoisted(
  () => ({
    buildVideoMediaRecorderOptionsMock: vi.fn(),
    normalizeMultiSourceVideoStreamMock: vi.fn(),
  })
);

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: normalizeMultiSourceVideoStreamMock,
}));
vi.mock('../../../platform/media-utils/video-recording', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../platform/media-utils/video-recording')>();
  buildVideoMediaRecorderOptionsMock.mockImplementation(original.buildVideoMediaRecorderOptions);
  return {
    ...original,
    buildVideoMediaRecorderOptions: buildVideoMediaRecorderOptionsMock,
  };
});

import { createWebcamSidecarRecorder } from './webcam';

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstart = null;
  onstop = null;
  state: RecordingState = 'inactive';
  mimeType: string;

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions
  ) {
    this.mimeType = options.mimeType ?? '';
  }
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
    coordinator: createRecordingStagingCoordinatorTestDouble(),
    settings,
  });

  expect(normalizeMultiSourceVideoStreamMock).toHaveBeenCalledWith(expect.anything(), settings, {
    contentHint: 'motion',
    frameRate: 30,
  });
  expect(recorder?.recorder).toMatchObject({
    options: { videoBitsPerSecond: 8_000_000 },
    stream: recorder?.stream,
  });
  expect(recorder?.trackSettings).toEqual({ frameRate: 30, height: 1080, width: 1920 });
  expect(recorder?.artifactSession).toBeDefined();
  expect(stopOutputTrack).not.toHaveBeenCalled();
  expect(stopSourceTrack).not.toHaveBeenCalled();
});

it('aborts the normalized webcam artifact through its shared session', async () => {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    coordinator,
    settings: createSettings(),
  });

  await recorder?.artifactSession.abort();

  expect(coordinator.abort).toHaveBeenCalledOnce();
});

it('rejects and releases normalized media when recorder options omit a MIME type', async () => {
  buildVideoMediaRecorderOptionsMock.mockReturnValueOnce({ videoBitsPerSecond: 8_000_000 });

  await expect(
    createWebcamSidecarRecorder({
      baseRecordingId: 'recording-1',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: createSettings(),
    })
  ).rejects.toThrow('Unsupported recorded video MIME type: (empty)');

  expect(stopOutputTrack).toHaveBeenCalledOnce();
});
