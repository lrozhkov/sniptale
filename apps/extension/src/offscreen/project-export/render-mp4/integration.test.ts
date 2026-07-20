import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureMp4ExportSupportMock,
  getSupportedMp4AudioEncoderMock,
  getSupportedMp4VideoEncoderMock,
  loggerWarnMock,
  renderOfflineAudioMixMock,
} = vi.hoisted(() => ({
  ensureMp4ExportSupportMock: vi.fn(),
  getSupportedMp4AudioEncoderMock: vi.fn(),
  getSupportedMp4VideoEncoderMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  renderOfflineAudioMixMock: vi.fn(),
}));

vi.mock('mp4-muxer', () => ({
  ArrayBufferTarget: class {
    buffer = new ArrayBuffer(16);
  },
  Muxer: class {
    constructor(public options: unknown) {}
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('../codecs', () => ({
  ensureMp4ExportSupport: ensureMp4ExportSupportMock,
  getSupportedMp4AudioEncoder: getSupportedMp4AudioEncoderMock,
  getSupportedMp4VideoEncoder: getSupportedMp4VideoEncoderMock,
  normalizeError: (error: unknown) => error,
}));

vi.mock('../offline-audio', () => ({
  renderOfflineAudioMix: renderOfflineAudioMixMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { createMp4EncoderState } from './encoder-state';
import { createMp4Pipeline } from './pipeline';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  VideoTimelinePlacementMode,
} from '../../../features/video/project/types';

type EncoderCallbacks = {
  error: (error: unknown) => void;
  output: (chunk: unknown, meta: unknown) => void;
};

function createProject() {
  return {
    version: 1,
    id: 'project-1',
    name: 'Project',
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
  };
}

function createMp4Settings() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.AVC,
    downloadAfterExport: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderOfflineAudioMixMock.mockResolvedValue({
    buffer: { id: 'audio-buffer' },
    settings: {
      numberOfChannels: 2,
      sampleRate: 48_000,
    },
  });
  getSupportedMp4VideoEncoderMock.mockResolvedValue({
    muxerCodec: 'avc',
    label: 'AVC',
    config: { codec: 'avc1.640028' },
  });
  getSupportedMp4AudioEncoderMock.mockResolvedValue({
    muxerCodec: 'opus',
    label: 'Opus fallback',
    config: { codec: 'opus' },
  });
});

async function createPipeline() {
  return createMp4Pipeline(createProject() as never, createMp4Settings());
}

it('collects only audio fallback notes when AAC is unavailable', async () => {
  const pipeline = await createPipeline();

  expect(ensureMp4ExportSupportMock).toHaveBeenCalledWith(true);
  expect(getSupportedMp4VideoEncoderMock).toHaveBeenCalledWith(
    createMp4Settings(),
    VideoMp4Codec.AVC
  );
  expect(pipeline.fallbackNotes).toEqual(['Opus fallback']);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'AAC encoder unavailable, falling back to',
    'Opus fallback'
  );
});

it('skips fallback warnings when the primary AVC path is available and there is no mixed audio', async () => {
  renderOfflineAudioMixMock.mockResolvedValueOnce(null);
  getSupportedMp4VideoEncoderMock.mockResolvedValueOnce({
    muxerCodec: 'avc',
    label: 'AVC',
    config: { codec: 'avc1.42E01E' },
  });

  const pipeline = await createPipeline();

  expect(ensureMp4ExportSupportMock).toHaveBeenCalledWith(false);
  expect(getSupportedMp4AudioEncoderMock).not.toHaveBeenCalled();
  expect(pipeline.audioProfile).toBeNull();
  expect(pipeline.fallbackNotes).toEqual([]);
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('captures encoder callback failures and rethrows the remembered pipeline error', () => {
  let videoEncoderConfig: EncoderCallbacks | undefined;
  let audioEncoderConfig: EncoderCallbacks | undefined;

  class VideoEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      videoEncoderConfig = config;
    }
  }

  class AudioEncoderMock {
    configure = vi.fn();

    constructor(config: EncoderCallbacks) {
      audioEncoderConfig = config;
    }
  }

  vi.stubGlobal('VideoEncoder', VideoEncoderMock as never);
  vi.stubGlobal('AudioEncoder', AudioEncoderMock as never);

  const encoderState = createMp4EncoderState({
    muxer: {
      addAudioChunk: vi.fn(),
      addVideoChunk: vi.fn(() => {
        throw new Error('video chunk failed');
      }),
    },
    videoProfile: {
      config: { codec: 'vp09.00.10.08' },
    },
    audioProfile: {
      config: { codec: 'opus' },
    },
  } as never);

  if (videoEncoderConfig) {
    videoEncoderConfig.output({ id: 'video' }, { id: 'meta' });
  }
  expect(() => encoderState.throwIfPipelineFailed()).toThrow('video chunk failed');

  if (audioEncoderConfig) {
    audioEncoderConfig.error(new Error('audio encoder failed'));
  }
  expect(encoderState.audioEncoder).not.toBeNull();
});
