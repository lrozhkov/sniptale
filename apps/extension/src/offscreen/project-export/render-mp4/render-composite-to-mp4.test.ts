import { beforeEach, expect, it, vi } from 'vitest';

const {
  announceMp4PipelineStartMock,
  closeEncoderQuietlyMock,
  createMp4EncoderStateMock,
  createMp4PipelineMock,
  loggerErrorMock,
  normalizeMp4ExportErrorMock,
  runMp4EncodingPipelineMock,
} = vi.hoisted(() => ({
  announceMp4PipelineStartMock: vi.fn(),
  closeEncoderQuietlyMock: vi.fn(),
  createMp4EncoderStateMock: vi.fn(),
  createMp4PipelineMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  normalizeMp4ExportErrorMock: vi.fn(),
  runMp4EncodingPipelineMock: vi.fn(),
}));

vi.mock('../codecs', () => ({
  closeEncoderQuietly: closeEncoderQuietlyMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('./announce', () => ({
  announceMp4PipelineStart: announceMp4PipelineStartMock,
}));

vi.mock('./encoder-state', () => ({
  createMp4EncoderState: createMp4EncoderStateMock,
}));

vi.mock('./normalize-error', () => ({
  normalizeMp4ExportError: normalizeMp4ExportErrorMock,
}));

vi.mock('./pipeline/index', () => ({
  createMp4Pipeline: createMp4PipelineMock,
}));

vi.mock('./pipeline-runner', () => ({
  runMp4EncodingPipeline: runMp4EncodingPipelineMock,
}));

import { renderCompositeToMp4 } from './render-composite-to-mp4';

beforeEach(() => {
  vi.clearAllMocks();
  announceMp4PipelineStartMock.mockResolvedValue(undefined);
  createMp4PipelineMock.mockResolvedValue({
    fallbackNotes: ['VP9 fallback'],
  });
  createMp4EncoderStateMock.mockReturnValue({
    audioEncoder: { id: 'audio' },
    throwIfPipelineFailed: vi.fn(),
    videoEncoder: { id: 'video' },
  });
  runMp4EncodingPipelineMock.mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }));
});

it('creates the pipeline with the job signal, announces startup, and closes encoders after success', async () => {
  const signal = new AbortController().signal;
  const job = {
    cancelled: false,
    exportAbortController: { signal },
    jobId: 'job-1',
  };
  const project = { duration: 5 };
  const settings = { format: 'MP4' };
  const loadedImages = { image: true };
  const canvas = {} as HTMLCanvasElement;
  const context = {} as CanvasRenderingContext2D;

  const blob = await renderCompositeToMp4(
    job as never,
    project as never,
    settings as never,
    loadedImages as never,
    canvas,
    context
  );

  expect(createMp4PipelineMock).toHaveBeenCalledWith(project, settings, signal);
  expect(announceMp4PipelineStartMock).toHaveBeenCalledWith('job-1', ['VP9 fallback']);
  expect(runMp4EncodingPipelineMock).toHaveBeenCalledWith({
    audioEncoder: { id: 'audio' },
    canvas,
    context,
    job,
    loadedImages,
    pipeline: { fallbackNotes: ['VP9 fallback'] },
    project,
    settings,
    signal,
    throwIfPipelineFailed: createMp4EncoderStateMock.mock.results[0]?.value.throwIfPipelineFailed,
    videoEncoder: { id: 'video' },
  });
  expect(closeEncoderQuietlyMock).toHaveBeenCalledWith({ id: 'video' });
  expect(closeEncoderQuietlyMock).toHaveBeenCalledWith({ id: 'audio' });
  expect(blob.type).toBe('video/mp4');
});

it('normalizes failures, logs only failure-kind errors, and rethrows the normalized error', async () => {
  const normalizedError = new Error('normalized failure');
  runMp4EncodingPipelineMock.mockRejectedValueOnce(new Error('pipeline failed'));
  normalizeMp4ExportErrorMock.mockReturnValueOnce({
    error: normalizedError,
    kind: 'failure',
  });

  await expect(
    renderCompositeToMp4(
      { cancelled: false, exportAbortController: null, jobId: 'job-2' } as never,
      { duration: 5 } as never,
      { format: 'MP4' } as never,
      {} as never,
      {} as HTMLCanvasElement,
      {} as CanvasRenderingContext2D
    )
  ).rejects.toThrow('normalized failure');

  expect(normalizeMp4ExportErrorMock).toHaveBeenCalledWith(expect.any(Error), false);
  expect(loggerErrorMock).toHaveBeenCalledWith('MP4 encode failed', expect.any(Error));
  expect(closeEncoderQuietlyMock).toHaveBeenCalledTimes(2);
});
