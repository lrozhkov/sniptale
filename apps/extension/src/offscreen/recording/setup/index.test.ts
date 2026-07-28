import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  attachMicrophone: vi.fn(),
  createCrop: vi.fn(),
  createSourceVideo: vi.fn(),
  createTabOutput: vi.fn(),
  releaseSourceVideo: vi.fn(),
  resolveCrop: vi.fn(),
  resolveTabGeometry: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./capture', () => ({ acquireRecordingSourceStream: mocks.acquire }));
vi.mock('./video', () => ({ attachMicrophoneAudioIfEnabled: mocks.attachMicrophone }));
vi.mock('../stream/crop-stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream/crop-stream')>()),
  createCropStream: mocks.createCrop,
  resolveOnePixelEncodingCrop: mocks.resolveCrop,
}));
vi.mock('../stream/tab-output', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream/tab-output')>()),
  createTabOutputStream: mocks.createTabOutput,
  resolveTabOutputGeometry: mocks.resolveTabGeometry,
}));
vi.mock('../stream/video-source', () => ({
  createSourceVideo: mocks.createSourceVideo,
  releaseSourceVideo: mocks.releaseSourceVideo,
  waitForSourceMetadata: mocks.waitForSourceMetadata,
}));

import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';
import { createEmptyStream, createStream } from '../multi-source/media-stream.test-support';

const settings = {
  autoFadeDelay: 0,
  countdownSeconds: 0,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  openEditorAfterRecording: false,
  quality: VideoQuality.HIGH,
  systemAudioEnabled: false,
};

const geometry = {
  coordinateSpace: { width: 1280, height: 720, devicePixelRatio: 2 },
  requestedCrop: { x: 0, y: 0, width: 1280, height: 720 },
  sourceSize: { width: 2560, height: 1440 },
  sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
  outputSize: { width: 1280, height: 720 },
};

beforeEach(() => {
  vi.clearAllMocks();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  const source = createStream(2560, 1440);
  mocks.acquire.mockResolvedValue({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValue({ videoHeight: 1440, videoWidth: 2560 });
  mocks.waitForSourceMetadata.mockResolvedValue(undefined);
  mocks.resolveCrop.mockReturnValue(null);
  mocks.resolveTabGeometry.mockReturnValue(geometry);
  mocks.createCrop.mockResolvedValue(createStream(1278, 720));
  mocks.createTabOutput.mockResolvedValue(createStream(1280, 720));
  mocks.attachMicrophone.mockResolvedValue(undefined);
});

it('accepts a natural physical TAB source and produces the canonical CSS output', async () => {
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings,
      streamId: 'stream-1',
      viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    })
  ).resolves.toEqual({
    cursorCaptureMode: null,
    rawTrackSettings: { height: 1440, width: 2560 },
    rawVideoHeight: 1440,
    rawVideoWidth: 2560,
    tabOutputGeometry: geometry,
    trackSettings: { height: 720, width: 1280 },
  });

  expect(mocks.acquire).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-1',
    viewport: { width: 1280, height: 720 },
  });
  expect(mocks.resolveTabGeometry).toHaveBeenCalledWith(
    { x: 0, y: 0, width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1280, height: 720, devicePixelRatio: 2 }
  );
  expect(mocks.createTabOutput).toHaveBeenCalledWith(expect.anything(), geometry);
  expect(mocks.releaseSourceVideo).toHaveBeenCalledOnce();
});

it('uses the selected CSS region for TAB_CROP output mapping', async () => {
  const crop = { height: 300, width: 300, x: 10, y: 20 };
  await prepareRecordingStream({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: crop,
    settings,
    streamId: 'stream-crop',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });
  expect(mocks.resolveTabGeometry).toHaveBeenCalledWith(
    crop,
    { width: 2560, height: 1440 },
    { width: 1280, height: 720, devicePixelRatio: 2 }
  );
});

it('fails TAB/TAB_CROP when the CSS viewport is unavailable', async () => {
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: { height: 200, width: 300, x: 10, y: 20 },
      settings,
      streamId: 'stream-crop',
    })
  ).rejects.toThrow('viewport geometry is unavailable');
});

it('fails closed when the applied viewport and measured CSS viewport disagree', async () => {
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings,
      streamId: 'stream-mismatch',
      surface: {
        presetId: 'viewport-1',
        target: 'viewport',
        width: 1425,
        height: 740,
      },
      viewport: { width: 1424, height: 740 },
    })
  ).rejects.toThrow('applied viewport geometry is unavailable');
  expect(mocks.createTabOutput).not.toHaveBeenCalled();
});

it.each([CaptureMode.SCREEN, CaptureMode.CAMERA])(
  'keeps %s sources direct without tab output mapping',
  async (captureMode) => {
    await expect(
      prepareRecordingStream({ captureMode, settings, streamId: `stream-${captureMode}` })
    ).resolves.toMatchObject({ tabOutputGeometry: null });
    expect(mocks.resolveTabGeometry).not.toHaveBeenCalled();
    expect(mocks.createTabOutput).not.toHaveBeenCalled();
  }
);

it('keeps the legacy odd-axis raw crop 1:1', async () => {
  const encodingCrop = {
    sourceRect: { x: 0, y: 0, width: 1278, height: 720 },
    outputSize: { width: 1278, height: 720 },
  };
  mocks.resolveCrop.mockReturnValueOnce(encodingCrop);
  await prepareRecordingStream({ settings, streamId: 'stream-odd' });
  expect(mocks.createCrop).toHaveBeenCalledWith(expect.anything(), encodingCrop);
});

it('fails when the raw or output stream has no video track', async () => {
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: createEmptyStream() });
  await expect(prepareRecordingStream({ settings, streamId: 'missing-raw' })).rejects.toThrow(
    'missing a video track'
  );

  mocks.acquire.mockResolvedValueOnce({
    cursorCaptureMode: null,
    stream: createStream(2560, 1440),
  });
  mocks.createTabOutput.mockResolvedValueOnce(createEmptyStream());
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings,
      streamId: 'missing-output',
      viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    })
  ).rejects.toThrow('output is missing a video track');
});

it('releases the temporary raw-source video when metadata loading fails', async () => {
  mocks.waitForSourceMetadata.mockRejectedValueOnce(new Error('metadata failed'));
  await expect(prepareRecordingStream({ settings, streamId: 'metadata-failure' })).rejects.toThrow(
    'metadata failed'
  );
  expect(mocks.releaseSourceVideo).toHaveBeenCalledOnce();
});
