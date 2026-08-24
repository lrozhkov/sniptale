import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  attachMicrophone: vi.fn(),
  createFixedVideoOutput: vi.fn(),
  createSourceVideo: vi.fn(),
  createTabOutput: vi.fn(),
  releaseSourceVideo: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./capture', () => ({ acquireRecordingSourceStream: mocks.acquire }));
vi.mock('./video', () => ({
  attachMicrophoneAudioIfEnabled: mocks.attachMicrophone,
  prepareStableTabRecordingAudio: mocks.attachMicrophone,
}));
vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: mocks.createFixedVideoOutput,
}));
vi.mock('../stream/tab-output', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream/tab-output')>()),
  createTabOutputStream: mocks.createTabOutput,
}));
vi.mock('../stream/video-source', () => ({
  createSourceVideo: mocks.createSourceVideo,
  releaseSourceVideo: mocks.releaseSourceVideo,
  waitForSourceMetadata: mocks.waitForSourceMetadata,
}));

import {
  CaptureMode,
  VideoFrameRate,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createConfigurableVideoStream } from '../multi-source/media-stream.test-support';
import { createRecordingGeometryPlan } from '../geometry/plan';
import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';

const settings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 0,
  countdownSeconds: 0,
  interactionDiagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  systemAudioEnabled: false,
};

function createRecordingStream(
  width: number,
  height: number,
  frameRate = 30,
  additionalSettings: MediaTrackSettings = {}
): MediaStream {
  const trackSettings: MediaTrackSettings = {
    ...additionalSettings,
    frameRate,
    height,
    width,
  };
  const stream = createConfigurableVideoStream({
    applyConstraints: async () => {
      throw new Error('Source-track constraints must not realize recording output geometry');
    },
    settings: trackSettings,
  });
  vi.spyOn(stream.getVideoTracks()[0]!, 'getSettings').mockImplementation(() => ({
    ...trackSettings,
  }));
  return stream;
}

beforeEach(() => {
  vi.clearAllMocks();
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValue({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValue({ videoHeight: 1440, videoWidth: 2560 });
  mocks.waitForSourceMetadata.mockResolvedValue(undefined);
  mocks.createTabOutput.mockImplementation(
    async (
      source: MediaStream,
      tabGeometry: {
        fillsOutput?: boolean;
        outputSize: { width: number; height: number };
        sourceRect: { x: number; y: number; width: number; height: number };
        sourceSize: { width: number; height: number };
      },
      options: { frameRate?: number } = {}
    ) => {
      const transformed =
        tabGeometry.outputSize.width !== tabGeometry.sourceSize.width ||
        tabGeometry.outputSize.height !== tabGeometry.sourceSize.height ||
        tabGeometry.sourceRect.x !== 0 ||
        tabGeometry.sourceRect.y !== 0 ||
        tabGeometry.sourceRect.width !== tabGeometry.sourceSize.width ||
        tabGeometry.sourceRect.height !== tabGeometry.sourceSize.height;
      return {
        frameRate: options.frameRate ?? 30,
        ...(transformed
          ? {
              frameTransform: {
                fit: tabGeometry.fillsOutput ? ('fill' as const) : ('contain' as const),
                outputSize: tabGeometry.outputSize,
                sourceRect: tabGeometry.sourceRect,
              },
            }
          : {}),
        stream: source,
      };
    }
  );
  mocks.createFixedVideoOutput.mockImplementation(
    async (
      source: MediaStream,
      fixedSettings: typeof settings,
      options: { frameRate?: number } = {}
    ) => {
      const sourceSettings = source.getVideoTracks()[0]?.getSettings() ?? {};
      const outputBasis = {
        height: sourceSettings.height ?? 1440,
        width: sourceSettings.width ?? 2560,
      };
      const dimensions = createRecordingGeometryPlan({
        frameRateCap: fixedSettings.outputProfile.frameRate,
        outputBasis,
        resolution: fixedSettings.outputProfile.resolution,
        sourceRect: { x: 0, y: 0, ...outputBasis },
      }).outputSize;
      return {
        dimensions,
        frameRate: options.frameRate ?? 30,
        stream: createRecordingStream(dimensions.width, dimensions.height),
      };
    }
  );
  mocks.attachMicrophone.mockResolvedValue(undefined);
});

it('does not upscale a smaller TAB source to a nominal 1080p preset', async () => {
  const source = createRecordingStream(1904, 984, 30);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 984, videoWidth: 1904 });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-small-tab-1080p',
    viewport: { width: 1904, height: 984, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { height: 984, width: 1904 } }),
    { frameRate: 30 }
  );
  expect(prepared.encoderFrameTransform).toBeNull();
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 984, width: 1904 });
});

it('records the scheduler cadence when Chromium reports manual canvas cadence as zero', async () => {
  const canvasOutput = createRecordingStream(1920, 1080);
  const canvasTrack = canvasOutput.getVideoTracks()[0]!;
  vi.mocked(canvasTrack.getSettings).mockReturnValue({
    frameRate: 0,
    height: 1080,
    width: 1920,
  });
  mocks.createTabOutput.mockResolvedValueOnce({ frameRate: 24, stream: canvasOutput });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-manual-canvas',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.trackSettings).toEqual({ frameRate: 24, height: 1080, width: 1920 });
});

it('uses the selected desktop cadence when Chromium reports a higher source cadence', async () => {
  const source = createRecordingStream(2560, 1392, 60, { displaySurface: 'window' });
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1392, videoWidth: 2560 });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.SCREEN,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      },
    },
    streamId: 'stream-window-60-source-30-selected',
  });

  expect(mocks.createFixedVideoOutput).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toEqual({
    displaySurface: 'window',
    frameRate: 30,
    height: 1392,
    width: 2560,
  });
});
