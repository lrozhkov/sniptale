import { beforeEach, expect, it, vi } from 'vitest';

const {
  closeEncoderQuietlyMock,
  createMp4EncoderStateMock,
  createMp4PipelineMock,
  encodeOfflineAudioBufferMock,
  getExportFormatDescriptorMock,
  isAbortLikeErrorMock,
  loggerErrorMock,
  runMp4HybridVideoPipelineMock,
  sendProgressMock,
} = vi.hoisted(() => ({
  closeEncoderQuietlyMock: vi.fn(),
  createMp4EncoderStateMock: vi.fn(),
  createMp4PipelineMock: vi.fn(),
  encodeOfflineAudioBufferMock: vi.fn(),
  getExportFormatDescriptorMock: vi.fn(),
  isAbortLikeErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  runMp4HybridVideoPipelineMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('../codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../codecs')>()),
  closeEncoderQuietly: closeEncoderQuietlyMock,
  isAbortLikeError: isAbortLikeErrorMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../offline-audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offline-audio')>()),
  encodeOfflineAudioBuffer: encodeOfflineAudioBufferMock,
}));

vi.mock('../persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence')>()),
  getExportFormatDescriptor: getExportFormatDescriptorMock,
}));

vi.mock('./hybrid', () => ({
  Mp4VideoRenderSpan: undefined,
  canUseHybridMp4VideoPipeline: vi.fn(),
  planMp4VideoRenderSpans: vi.fn(),
  runMp4HybridVideoPipeline: runMp4HybridVideoPipelineMock,
}));

vi.mock('./encoder-state', () => ({
  createMp4EncoderState: createMp4EncoderStateMock,
}));

vi.mock('./pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pipeline')>()),
  createMp4Pipeline: createMp4PipelineMock,
}));

vi.mock('../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime')>()),
  sendProgress: sendProgressMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { renderCompositeToMp4 } from './index';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
} from '../../../features/video/project/types';

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

function createExportSettings() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

function createRenderJob() {
  return {
    cancelled: false,
    exportAbortController: { signal: undefined },
    jobId: 'job-1',
  };
}

async function renderMp4() {
  return renderCompositeToMp4(
    createRenderJob() as never,
    createProject() as never,
    createExportSettings(),
    {} as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isAbortLikeErrorMock.mockReturnValue(false);
  createMp4PipelineMock.mockResolvedValue({
    fallbackNotes: [],
    mixedAudio: null,
    muxer: { finalize: vi.fn() },
    target: { buffer: new ArrayBuffer(16) },
  });
  createMp4EncoderStateMock.mockReturnValue({
    videoEncoder: { flush: vi.fn() },
    audioEncoder: null,
    throwIfPipelineFailed: vi.fn(),
  });
  sendProgressMock.mockResolvedValue(undefined);
  getExportFormatDescriptorMock.mockReturnValue({ mimeType: 'video/mp4' });
});

it('logs non-abort encoding failures and rethrows a translated export error', async () => {
  runMp4HybridVideoPipelineMock.mockRejectedValue(new Error('encoder blew up'));

  await expect(renderMp4()).rejects.toThrow(
    'offscreenExport.mp4PrepareFailedPrefix encoder blew up'
  );

  expect(loggerErrorMock).toHaveBeenCalledWith('MP4 encode failed', expect.any(Error));
  expect(closeEncoderQuietlyMock).toHaveBeenCalledTimes(2);
});

function mockSuccessfulMp4Render() {
  const videoFlushMock = vi.fn().mockResolvedValue(undefined);
  const audioFlushMock = vi.fn().mockResolvedValue(undefined);
  const finalizeMock = vi.fn();

  createMp4PipelineMock.mockResolvedValueOnce({
    fallbackNotes: ['VP9 fallback'],
    mixedAudio: {
      buffer: { id: 'audio-buffer' },
      settings: { numberOfChannels: 2, sampleRate: 48_000 },
    },
    muxer: { finalize: finalizeMock },
    target: { buffer: new ArrayBuffer(8) },
  });
  createMp4EncoderStateMock.mockReturnValueOnce({
    videoEncoder: { flush: videoFlushMock },
    audioEncoder: { flush: audioFlushMock },
    throwIfPipelineFailed: vi.fn(),
  });
  runMp4HybridVideoPipelineMock.mockResolvedValueOnce(undefined);

  return { audioFlushMock, finalizeMock, videoFlushMock };
}

it('returns a finalized MP4 blob after rendering, audio encoding, and flushes succeed', async () => {
  const success = mockSuccessfulMp4Render();
  const blob = await renderMp4();

  expect(sendProgressMock).toHaveBeenCalledTimes(2);
  expect(encodeOfflineAudioBufferMock).toHaveBeenCalledOnce();
  expect(success.videoFlushMock).toHaveBeenCalledOnce();
  expect(success.audioFlushMock).toHaveBeenCalledOnce();
  expect(success.finalizeMock).toHaveBeenCalledOnce();
  expect(blob.type).toBe('video/mp4');
});

it('maps abort-like failures to the cancelled export sentinel', async () => {
  isAbortLikeErrorMock.mockReturnValueOnce(true);
  runMp4HybridVideoPipelineMock.mockRejectedValueOnce(new Error('abort'));

  await expect(renderMp4()).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
});
