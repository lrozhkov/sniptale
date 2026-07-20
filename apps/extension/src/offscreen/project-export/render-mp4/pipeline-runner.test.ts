import { beforeEach, expect, it, vi } from 'vitest';

const runMp4HybridVideoPipelineMock = vi.hoisted(() => vi.fn());
const encodeMp4AudioIfPresentMock = vi.hoisted(() => vi.fn());
const finalizeMp4MuxingMock = vi.hoisted(() => vi.fn());
const flushMp4EncodersMock = vi.hoisted(() => vi.fn());

vi.mock('./hybrid', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hybrid')>()),
  runMp4HybridVideoPipeline: runMp4HybridVideoPipelineMock,
}));

vi.mock('./audio', () => ({
  encodeMp4AudioIfPresent: encodeMp4AudioIfPresentMock,
}));

vi.mock('./finalize', () => ({
  finalizeMp4Muxing: finalizeMp4MuxingMock,
  flushMp4Encoders: flushMp4EncodersMock,
}));

import { runMp4EncodingPipeline } from './pipeline-runner';

beforeEach(() => {
  runMp4HybridVideoPipelineMock.mockReset();
  encodeMp4AudioIfPresentMock.mockReset();
  finalizeMp4MuxingMock.mockReset();
  flushMp4EncodersMock.mockReset();
});

it('runs render, audio, flush, and finalize in order', async () => {
  runMp4HybridVideoPipelineMock.mockResolvedValue(undefined);
  encodeMp4AudioIfPresentMock.mockResolvedValue(undefined);
  flushMp4EncodersMock.mockResolvedValue(undefined);
  finalizeMp4MuxingMock.mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }));

  const result = await runMp4EncodingPipeline({
    audioEncoder: {} as AudioEncoder,
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    job: { jobId: 'job-1' } as never,
    loadedImages: {},
    pipeline: { mixedAudio: null } as never,
    project: { duration: 1 } as never,
    settings: { fps: 30 } as never,
    throwIfPipelineFailed: vi.fn(),
    videoEncoder: {} as VideoEncoder,
  });

  expect(runMp4HybridVideoPipelineMock).toHaveBeenCalledOnce();
  expect(encodeMp4AudioIfPresentMock).toHaveBeenCalledOnce();
  expect(flushMp4EncodersMock).toHaveBeenCalledOnce();
  expect(finalizeMp4MuxingMock).toHaveBeenCalledOnce();
  expect(result.type).toBe('video/mp4');
});

it('forwards the abort signal through the render and audio stages', async () => {
  const signal = new AbortController().signal;
  const throwIfPipelineFailed = vi.fn();

  runMp4HybridVideoPipelineMock.mockResolvedValue(undefined);
  encodeMp4AudioIfPresentMock.mockResolvedValue(undefined);
  flushMp4EncodersMock.mockResolvedValue(undefined);
  finalizeMp4MuxingMock.mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }));

  await runMp4EncodingPipeline({
    audioEncoder: null,
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    job: { jobId: 'job-2' } as never,
    loadedImages: {},
    pipeline: { mixedAudio: null } as never,
    project: { duration: 1 } as never,
    settings: { fps: 30 } as never,
    signal,
    throwIfPipelineFailed,
    videoEncoder: {} as VideoEncoder,
  });

  expect(runMp4HybridVideoPipelineMock).toHaveBeenCalledWith(
    expect.objectContaining({ signal, throwIfPipelineFailed })
  );
  expect(encodeMp4AudioIfPresentMock).toHaveBeenCalledWith({
    audioEncoder: null,
    pipeline: { mixedAudio: null },
    signal,
    throwIfPipelineFailed,
  });
  expect(throwIfPipelineFailed).toHaveBeenCalledTimes(3);
});
