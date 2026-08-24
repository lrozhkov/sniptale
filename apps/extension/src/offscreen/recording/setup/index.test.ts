import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  attachMicrophone: vi.fn(),
  createFixedVideoOutput: vi.fn(),
  createSourceVideo: vi.fn(),
  createTabOutput: vi.fn(),
  releaseSourceVideo: vi.fn(),
  resolveTabGeometry: vi.fn(),
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
vi.mock('../stream/tab-output', async (importOriginal) => {
  const original = await importOriginal<typeof import('../stream/tab-output')>();
  mocks.resolveTabGeometry.mockImplementation(original.resolveTabOutputGeometry);
  return {
    ...original,
    createTabOutputStream: mocks.createTabOutput,
    resolveTabOutputGeometry: mocks.resolveTabGeometry,
  };
});
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
import { recordingContext } from '../context';
import { prepareRecordingStream } from '.';
import { createRecordingGeometryPlan } from '../geometry/plan';
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
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
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
    { frameRate: 30 }
  );
  expect(mocks.releaseSourceVideo).toHaveBeenCalledOnce();
});

it('keeps a window-preset TAB output on the controlled tab canvas path', async () => {
  await prepareRecordingStream({
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

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 1920, height: 1080 } }),
    { frameRate: 30 }
  );
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

it('keeps an acquired 60 FPS TAB source authoritative without cadence synthesis', async () => {
  const source = createRecordingStream(2560, 1304, 60);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1304, videoWidth: 2560 });
  mocks.createTabOutput.mockResolvedValueOnce({ frameRate: 60, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings: {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        frameRate: 60,
        resolution: VideoResolutionPreset.SOURCE,
      },
    },
    streamId: 'stream-60fps-source-30fps',
    viewport: { width: 2560, height: 1304, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    frameRate: 60,
  });
  expect(prepared.rawTrackSettings.frameRate).toBe(60);
  expect(prepared.trackSettings).toEqual({ frameRate: 60, height: 1304, width: 2560 });
});

it('rejects contradictory TAB source FPS instead of switching to a canvas pipeline', async () => {
  const source = createRecordingStream(2560, 1304, 30);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1304, videoWidth: 2560 });

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings: {
        ...settings,
        outputProfile: {
          ...settings.outputProfile,
          frameRate: VideoFrameRate.FPS60,
          resolution: VideoResolutionPreset.SOURCE,
        },
      },
      streamId: 'stream-contradictory-fps',
      viewport: { width: 2560, height: 1304, devicePixelRatio: 1 },
    })
  ).rejects.toThrow('source-frame-rate-mismatch: expected TAB source 60 FPS, received 30');

  expect(mocks.createTabOutput).not.toHaveBeenCalled();
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
    { width: 1280, height: 720, devicePixelRatio: 2 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.P1080,
      tracksFullViewport: false,
    }
  );
  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 600, height: 600 } }),
    { frameRate: 30 }
  );
});

it('keeps TAB_CROP with a window preset on the continuous crop path', async () => {
  await prepareRecordingStream({
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

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ outputSize: { width: 600, height: 600 } }),
    { frameRate: 30 }
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

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'accepts a %s source that Chromium returned one physical pixel below the measured viewport',
  async (captureMode) => {
    const source = createRecordingStream(2560, 1308);
    mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
    mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1308, videoWidth: 2560 });

    await expect(
      prepareRecordingStream({
        captureMode,
        ...(captureMode === CaptureMode.TAB_CROP
          ? { cropRegion: { height: 400, width: 600, x: 0, y: 0 } }
          : {}),
        settings,
        streamId: 'stream-rescaled-odd-viewport',
        viewport: { width: 2560, height: 1309, devicePixelRatio: 1 },
      })
    ).resolves.toMatchObject({ rawVideoHeight: 1308, rawVideoWidth: 2560 });

    expect(mocks.createTabOutput).toHaveBeenCalled();
  }
);

it('records a full TAB source from the measured Chromium raster even when it differs from viewport', async () => {
  mocks.acquire.mockResolvedValueOnce({
    cursorCaptureMode: null,
    stream: createRecordingStream(2560, 1303),
  });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1303, videoWidth: 2560 });

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings: {
        ...settings,
        outputProfile: { ...settings.outputProfile, resolution: VideoResolutionPreset.SOURCE },
      },
      streamId: 'stream-mismatched-viewport',
      viewport: { width: 2560, height: 1305, devicePixelRatio: 1 },
    })
  ).resolves.toMatchObject({
    rawVideoHeight: 1303,
    rawVideoWidth: 2560,
    tabOutputGeometry: expect.objectContaining({
      outputSize: { height: 1302, width: 2560 },
      sourceRect: { height: 1302, width: 2560, x: 0, y: 0 },
      sourceSize: { height: 1303, width: 2560 },
      tracksFullViewport: true,
    }),
  });
});

it('rejects TAB_CROP when the measured source cannot be mapped from viewport coordinates', async () => {
  mocks.acquire.mockResolvedValueOnce({
    cursorCaptureMode: null,
    stream: createRecordingStream(2560, 1303),
  });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1303, videoWidth: 2560 });

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: { height: 400, width: 600, x: 0, y: 0 },
      settings,
      streamId: 'stream-mismatched-crop-viewport',
      viewport: { width: 2560, height: 1305, devicePixelRatio: 1 },
    })
  ).rejects.toThrow('source-dimensions-mismatch: expected TAB source 2560x1305');
});

it('keeps odd full-tab SOURCE on the source stream with an encoder-frame transform', async () => {
  const source = createRecordingStream(2560, 1305, 60);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
  mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1305, videoWidth: 2560 });
  mocks.createTabOutput.mockResolvedValueOnce({
    frameRate: 60,
    frameTransform: {
      fit: 'fill',
      outputSize: { height: 1304, width: 2560 },
      sourceRect: { height: 1304, width: 2560, x: 0, y: 0 },
    },
    stream: source,
  });
  const sourceSettings = {
    ...settings,
    outputProfile: {
      ...settings.outputProfile,
      frameRate: VideoFrameRate.FPS60,
      resolution: VideoResolutionPreset.SOURCE,
    },
  };

  await expect(
    prepareRecordingStream({
      captureMode: CaptureMode.TAB,
      settings: sourceSettings,
      streamId: 'stream-odd-source-encoder-crop',
      viewport: { width: 2560, height: 1305, devicePixelRatio: 1 },
    })
  ).resolves.toMatchObject({
    encoderFrameTransform: {
      fit: 'fill',
      outputSize: { height: 1304, width: 2560 },
      sourceRect: { height: 1304, width: 2560, x: 0, y: 0 },
    },
    rawVideoHeight: 1305,
    rawVideoWidth: 2560,
    trackSettings: { frameRate: 60, height: 1304, width: 2560 },
  });
});

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'crops an odd %s native source to an even encoder-safe output without source rescaling',
  async (captureMode) => {
    const source = createRecordingStream(2560, 1309);
    mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });
    mocks.createSourceVideo.mockReturnValueOnce({ videoHeight: 1309, videoWidth: 2560 });
    const sourceSettings = {
      ...settings,
      outputProfile: {
        ...settings.outputProfile,
        resolution: VideoResolutionPreset.SOURCE,
      },
    };

    await expect(
      prepareRecordingStream({
        captureMode,
        ...(captureMode === CaptureMode.TAB_CROP
          ? { cropRegion: { height: 400, width: 600, x: 0, y: 0 } }
          : {}),
        settings: sourceSettings,
        streamId: 'stream-native-odd-viewport',
        viewport: { width: 2560, height: 1309, devicePixelRatio: 1 },
      })
    ).resolves.toMatchObject({
      rawVideoHeight: 1309,
      rawVideoWidth: 2560,
      tabOutputGeometry:
        captureMode === CaptureMode.TAB
          ? expect.objectContaining({
              outputSize: { height: 1308, width: 2560 },
              sourceRect: { height: 1308, width: 2560, x: 0, y: 0 },
            })
          : expect.anything(),
    });

    expect(mocks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: sourceSettings,
        viewport: { width: 2560, height: 1309, devicePixelRatio: 1 },
      })
    );
    expect(mocks.createTabOutput).toHaveBeenCalled();
  }
);

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

it('routes the primary full-source path through an encoder-adjacent transform', async () => {
  const source = createRecordingStream(2560, 1440, 30, { displaySurface: 'window' });
  const systemAudioTrack = createAudioStream().getAudioTracks()[0]!;
  vi.spyOn(source, 'getAudioTracks').mockReturnValue([systemAudioTrack]);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  const prepared = await prepareRecordingStream({
    captureMode: CaptureMode.SCREEN,
    settings: { ...settings, systemAudioEnabled: true },
    streamId: 'selected-window-source',
  });

  expect(mocks.createFixedVideoOutput).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toMatchObject({
    displaySurface: 'window',
    height: 1080,
    width: 1920,
  });
  expect(prepared.encoderFrameTransform).toMatchObject({
    fit: 'fill',
    outputSize: { height: 1080, width: 1920 },
  });
  expect(recordingContext.videoStream).toBe(source);
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

  expect(mocks.createFixedVideoOutput).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toMatchObject({ height: 480, width: 928 });
  expect(prepared.encoderFrameTransform).toMatchObject({
    outputSize: { height: 480, width: 928 },
  });
  expect(recordingContext.videoStream?.getVideoTracks()[0]?.contentHint).toBe('text');
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
    { frameRate: 30 }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 480, width: 854 });
  expect(recordingContext.videoStream?.getVideoTracks()[0]?.contentHint).toBe('text');
});

it('forwards measured TAB density to source acquisition before output geometry is created', async () => {
  const source = createRecordingStream(2560, 1440);
  mocks.acquire.mockResolvedValueOnce({ cursorCaptureMode: null, stream: source });

  await prepareRecordingStream({
    captureMode: CaptureMode.TAB,
    settings,
    streamId: 'stream-physical-viewport',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
  });

  expect(mocks.acquire).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: CaptureMode.TAB,
      viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    })
  );
  expect(mocks.acquire.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.createTabOutput.mock.invocationCallOrder[0]!
  );
});

it('uses the complete raw TAB capture as Source output authority', async () => {
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
    viewport: { width: 2560, height: 1440, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 2560, height: 1440 } }),
    { frameRate: 30 }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 1440, width: 2560 });
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
    streamId: 'stream-window-preset-source',
    surface: {
      presetId: 'window-1',
      target: 'window',
      width: 2560,
      height: 1440,
    },
    viewport: { width: 2560, height: 1440, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 2560, height: 1440 } }),
    { frameRate: 30 }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 1440, width: 2560 });
});

it('preserves the raw TAB capture aspect ratio for a 1440p output profile', async () => {
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
    viewport: { width: 2560, height: 1440, devicePixelRatio: 1 },
  });

  expect(mocks.createTabOutput).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ outputSize: { width: 2560, height: 1440 } }),
    { frameRate: 30 }
  );
  expect(prepared.trackSettings).toEqual({ frameRate: 30, height: 1440, width: 2560 });
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
  expect(mocks.createFixedVideoOutput).not.toHaveBeenCalled();
  expect(prepared.trackSettings).toMatchObject({ height: 720, width: 1278 });
  expect(prepared.encoderFrameTransform).toMatchObject({
    outputSize: { height: 720, width: 1278 },
  });
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
