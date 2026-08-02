import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  attachMicrophone: vi.fn(),
  createCrop: vi.fn(),
  createFixedVideoOutput: vi.fn(),
  createSourceVideo: vi.fn(),
  createTabOutput: vi.fn(),
  releaseSourceVideo: vi.fn(),
  resolveTabGeometry: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./capture', () => ({ acquireRecordingSourceStream: mocks.acquire }));
vi.mock('./video', () => ({ attachMicrophoneAudioIfEnabled: mocks.attachMicrophone }));
vi.mock('../stream/crop-stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stream/crop-stream')>()),
  createCropStream: mocks.createCrop,
}));
vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: mocks.createFixedVideoOutput,
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

import {
  CaptureMode,
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';
import {
  createAudioStream,
  createConfigurableVideoStream,
  createEmptyStream,
} from '../multi-source/media-stream.test-support';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const settings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 0,
  countdownSeconds: 0,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  systemAudioEnabled: false,
};

const geometry = {
  coordinateSpace: { width: 1280, height: 720, devicePixelRatio: 2 },
  fit: 'contain' as const,
  frameRateCap: 30 as const,
  logicalContentRect: { x: 0, y: 0, width: 2560, height: 1440 },
  outputBasis: { width: 1280, height: 720 },
  requestedCrop: { x: 0, y: 0, width: 1280, height: 720 },
  sourceSize: { width: 2560, height: 1440 },
  sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
  outputSize: { width: 1280, height: 720 },
  tracksFullViewport: false,
};
const tabOutputControls = {
  activate: vi.fn(),
  applyFrozenSourceGeometry: vi.fn(() => 'applied' as const),
  readFrozenSourceSize: vi.fn(),
  setFrozen: vi.fn(),
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
  mocks.resolveTabGeometry.mockImplementation(
    (
      requestedCrop,
      sourceSize,
      coordinateSpace,
      options: {
        frameRateCap: 30;
        resolution: VideoResolutionPreset;
        tracksFullViewport?: boolean;
      }
    ) => ({
      ...geometry,
      coordinateSpace,
      frameRateCap: options.frameRateCap,
      outputBasis: { height: requestedCrop.height, width: requestedCrop.width },
      outputSize: resolveVideoOutputDimensions(
        requestedCrop.width,
        requestedCrop.height,
        options.resolution
      ),
      requestedCrop,
      sourceSize,
      tracksFullViewport: options.tracksFullViewport === true,
    })
  );
  mocks.createCrop.mockImplementation(
    async (_source: MediaStream, cropGeometry: { outputSize: { width: number; height: number } }) =>
      createRecordingStream(cropGeometry.outputSize.width, cropGeometry.outputSize.height)
  );
  mocks.createFixedVideoOutput.mockImplementation(
    async (
      source: MediaStream,
      fixedSettings: typeof settings,
      options: { frameRate?: number } = {}
    ) => {
      const sourceSettings = source.getVideoTracks()[0]?.getSettings() ?? {};
      const dimensions = resolveVideoOutputDimensions(
        sourceSettings.width ?? 2560,
        sourceSettings.height ?? 1440,
        fixedSettings.outputProfile.resolution
      );
      return {
        dimensions,
        frameRate: options.frameRate ?? 30,
        stream: createRecordingStream(dimensions.width, dimensions.height),
      };
    }
  );
  mocks.createTabOutput.mockImplementation(
    async (
      _source: MediaStream,
      tabGeometry: { outputSize: { width: number; height: number } }
    ) => ({
      controls: tabOutputControls,
      frameRate: 30,
      stream: createRecordingStream(tabGeometry.outputSize.width, tabGeometry.outputSize.height),
    })
  );
  mocks.attachMicrophone.mockResolvedValue(undefined);
});

it('materializes the selected output geometry for a normal full-tab source', async () => {
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings,
      streamId: 'stream-1',
      viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    })
  ).resolves.toMatchObject({
    cursorCaptureMode: null,
    rawTrackSettings: { frameRate: 30, height: 1440, width: 2560 },
    rawVideoHeight: 1440,
    rawVideoWidth: 2560,
    tabOutputControls,
    tabOutputGeometry: {
      outputSize: { height: 1080, width: 1920 },
      tracksFullViewport: true,
    },
    trackSettings: { frameRate: 30, height: 1080, width: 1920 },
  });

  expect(mocks.acquire).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-1',
  });
  expect(mocks.resolveTabGeometry).toHaveBeenCalledWith(
    { x: 0, y: 0, width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1280, height: 720, devicePixelRatio: 2 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.P1080,
      tracksFullViewport: true,
    }
  );
  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1920, height: 1080 } }),
    { frameRate: 30, initiallySuspended: false }
  );
  expect(mocks.createCrop).not.toHaveBeenCalled();
  expect(mocks.releaseSourceVideo).toHaveBeenCalledOnce();
});

it('starts viewport-preset output behind a closed frame gate', async () => {
  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-viewport',
    surface: {
      presetId: 'viewport-1',
      target: 'viewport',
      width: 1280,
      height: 720,
    },
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1920, height: 1080 } }),
    { frameRate: 30, initiallySuspended: true }
  );
  expect(mocks.acquire).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-viewport',
  });
  expect(prepared.tabOutputControls).toBe(tabOutputControls);
});

it('keeps a window-preset TAB output on the controlled tab canvas path', async () => {
  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-window',
    surface: {
      presetId: 'window-1',
      target: 'window',
      width: 1280,
      height: 720,
    },
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.tabOutputControls).toBe(tabOutputControls);
  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1920, height: 1080 } }),
    { frameRate: 30, initiallySuspended: false }
  );
  expect(mocks.createCrop).not.toHaveBeenCalled();
});

it('snapshots verified encoder metadata before audio stream composition', async () => {
  const source = createRecordingStream(2560, 1440);
  const track = source.getVideoTracks()[0]!;
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.attachMicrophone.mockImplementationOnce(async () => {
    vi.mocked(track.getSettings).mockReturnValue({});
  });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-audio-composition',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 1080, width: 1920 });
});

it('records the resolved fixed cadence when a canvas track omits frame-rate metadata', async () => {
  const canvasOutput = createRecordingStream(1920, 1080);
  const canvasTrack = canvasOutput.getVideoTracks()[0]!;
  vi.mocked(canvasTrack.getSettings).mockReturnValue({ height: 1080, width: 1920 });
  mocks.createTabOutput.mockResolvedValueOnce({
    controls: tabOutputControls,
    frameRate: 24,
    stream: canvasOutput,
  });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-fixed-canvas',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.trackSettings).toEqual({ frameRate: 24, height: 1080, width: 1920 });
});

it('retains source display-surface provenance on the derived encoder track metadata', async () => {
  const source = createRecordingStream(2560, 1440, 30, { displaySurface: 'browser' });
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-display-surface',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.trackSettings).toEqual({
    displaySurface: 'browser',
    frameRate: 30,
    height: 1080,
    width: 1920,
  });
});

it('uses the selected CSS region for TAB_CROP output mapping', async () => {
  const crop = { height: 300, width: 300, x: 10, y: 20 };
  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: crop,
    settings,
    streamId: 'stream-crop',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });
  expect(mocks.resolveTabGeometry).toHaveBeenCalledWith(
    crop,
    { width: 2560, height: 1440 },
    { width: 1280, height: 720, devicePixelRatio: 2 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.P1080,
      tracksFullViewport: false,
    }
  );
  expect(prepared.tabOutputControls).toBe(tabOutputControls);
  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1080, height: 1080 } }),
    { frameRate: 30, initiallySuspended: false }
  );
});

it('retains exact-output controls for TAB_CROP with a window preset', async () => {
  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 300, width: 300, x: 10, y: 20 },
    settings,
    streamId: 'stream-crop-window',
    surface: {
      presetId: 'window-1',
      target: 'window',
      width: 1280,
      height: 720,
    },
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(prepared.tabOutputControls).toBe(tabOutputControls);
  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1080, height: 1080 } }),
    { frameRate: 30, initiallySuspended: false }
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
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: { x: 0, y: 0, width: 1280, height: 720 },
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

it('routes the primary full-source path through the dynamic fixed-video adapter', async () => {
  const source = createRecordingStream(2560, 1440, 30, { displaySurface: 'window' });
  const systemAudioTrack = createAudioStream().getAudioTracks()[0]!;
  vi.spyOn(source, 'getAudioTracks').mockReturnValue([systemAudioTrack]);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.SCREEN,
    settings: { ...settings, systemAudioEnabled: true },
    streamId: 'selected-window-source',
  });

  expect(mocks.createFixedVideoOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ systemAudioEnabled: true }),
    { frameRate: 30, includeSourceAudio: true, sourceOwnership: 'caller' }
  );
  expect(mocks.createCrop).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toMatchObject({
    displaySurface: 'window',
    height: 1080,
    width: 1920,
  });
});

it('materializes the selected 480p envelope on the actual recording stream', async () => {
  const source = createRecordingStream(1902, 984);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 984, videoWidth: 1902 });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.SCREEN,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.P480,
      },
    },
    streamId: 'stream-480p',
  });

  expect(mocks.createFixedVideoOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({
      outputProfile: expect.objectContaining({ resolution: VideoResolutionPreset.P480 }),
    }),
    { frameRate: 30, includeSourceAudio: true, sourceOwnership: 'caller' }
  );
  expect(mocks.createCrop).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toMatchObject({ height: 480, width: 928 });
  expect(recordingContext.videoStream?.getVideoTracks()[0]?.contentHint).toBe('detail');
});

it('encodes a 2560x1440 full-tab source as an exact 854x480 output', async () => {
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.P480,
      },
    },
    streamId: 'stream-full-tab-480p',
    viewport: { width: 1920, height: 1080, devicePixelRatio: 4 / 3 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 854, height: 480 } }),
    { frameRate: 30, initiallySuspended: false }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 480, width: 854 });
  expect(recordingContext.videoStream?.getVideoTracks()[0]?.contentHint).toBe('text');
});

it('uses the measured TAB viewport as Source output authority instead of the screen-sized raw track', async () => {
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.SOURCE,
      },
    },
    streamId: 'stream-full-tab-source',
    viewport: { width: 1904, height: 985, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 1904, height: 984 } }),
    { frameRate: 30, initiallySuspended: false }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 984, width: 1904 });
});

it('keeps the measured TAB viewport authoritative for Source with a viewport preset', async () => {
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.SOURCE,
      },
    },
    streamId: 'stream-viewport-preset-source',
    surface: {
      presetId: 'viewport-1',
      target: 'viewport',
      width: 1904,
      height: 985,
    },
    viewport: { width: 1904, height: 985, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 1904, height: 984 } }),
    { frameRate: 30, initiallySuspended: true }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 984, width: 1904 });
});

it('preserves the measured TAB aspect ratio for a 1440p output profile', async () => {
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.P1440,
      },
    },
    streamId: 'stream-full-tab-1440p',
    viewport: { width: 1904, height: 985, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 2784, height: 1440 } }),
    { frameRate: 30, initiallySuspended: false }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 1440, width: 2784 });
});

it('contains an odd-axis source in an encoder-safe even output', async () => {
  const source = createRecordingStream(1279, 721);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 721, videoWidth: 1279 });
  const prepared = await prepareRecordingStream({
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.SOURCE,
      },
    },
    streamId: 'stream-odd',
  });
  expect(mocks.createFixedVideoOutput).toHaveBeenCalledWith(source, expect.anything(), {
    frameRate: 30,
    includeSourceAudio: true,
    sourceOwnership: 'caller',
  });
  expect(prepared.trackSettings).toMatchObject({ height: 720, width: 1278 });
  expect(mocks.createCrop).not.toHaveBeenCalled();
});

it('fails when the raw or output stream has no video track', async () => {
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: createEmptyStream() });
  await expect(prepareRecordingStream({ settings, streamId: 'missing-raw' })).rejects.toThrow(
    'missing a video track'
  );

  mocks.acquire.mockResolvedValueOnce({
    cursorCaptureMode: null,
    stream: createRecordingStream(2560, 1440),
  });
  mocks.createTabOutput.mockResolvedValueOnce({
    controls: tabOutputControls,
    stream: createEmptyStream(),
  });
  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: { x: 0, y: 0, width: 1280, height: 720 },
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
