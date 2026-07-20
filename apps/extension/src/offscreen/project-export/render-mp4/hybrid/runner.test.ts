import { beforeEach, expect, it, vi } from 'vitest';

// State-machine proof: cancel/failure fallbacks stay terminal for hybrid export spans.
const encodeCleanSourceMp4SpanMock = vi.hoisted(() => vi.fn());
const planMp4VideoRenderSpansMock = vi.hoisted(() => vi.fn());
const renderAcceleratedCompositeWebmSpanMock = vi.hoisted(() => vi.fn());
const runFrameDrivenCompositeRenderLoopMock = vi.hoisted(() => vi.fn());
const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('./demux', () => ({
  encodeCleanSourceMp4Span: encodeCleanSourceMp4SpanMock,
}));

vi.mock('./planner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./planner')>()),
  planMp4VideoRenderSpans: planMp4VideoRenderSpansMock,
}));

vi.mock('./webm', () => ({
  renderAcceleratedCompositeWebmSpan: renderAcceleratedCompositeWebmSpanMock,
}));

vi.mock('../../render-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../render-loop')>()),
  runFrameDrivenCompositeRenderLoop: runFrameDrivenCompositeRenderLoopMock,
}));

vi.mock('../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime')>()),
  sendProgress: sendProgressMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { runMp4HybridVideoPipeline } from './runner';

function createArgs() {
  return {
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    job: { cancelled: false, jobId: 'job-1' },
    loadedImages: {},
    pipeline: {},
    project: { duration: 4 },
    settings: { fps: 30, format: 'MP4' },
    throwIfPipelineFailed: vi.fn(),
    videoEncoder: { encode: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  encodeCleanSourceMp4SpanMock.mockResolvedValue(true);
  renderAcceleratedCompositeWebmSpanMock.mockResolvedValue(true);
  runFrameDrivenCompositeRenderLoopMock.mockResolvedValue(undefined);
  sendProgressMock.mockResolvedValue(undefined);
});

it('renders clean spans without frame-driven fallback and offsets composite timestamps', async () => {
  const cleanSpan = {
    kind: 'clean-source',
    start: 0,
    end: 2,
    sourceStart: 0,
    sourceEnd: 2,
    asset: { id: 'asset-1', metadata: { mimeType: 'video/mp4' } },
    clip: { id: 'clip-1' },
  };
  const compositeSpan = { kind: 'composite', reason: 'cursor-overlay', start: 2, end: 4 };
  planMp4VideoRenderSpansMock.mockReturnValue([cleanSpan, compositeSpan]);
  const args = createArgs();

  await runMp4HybridVideoPipeline(args as never);

  expect(encodeCleanSourceMp4SpanMock).toHaveBeenCalledWith(
    expect.objectContaining({ span: cleanSpan, videoEncoder: args.videoEncoder })
  );
  expect(runFrameDrivenCompositeRenderLoopMock).toHaveBeenCalledTimes(1);
  expect(runFrameDrivenCompositeRenderLoopMock).toHaveBeenCalledWith(
    args.job,
    args.project,
    { ...args.settings, rangeEndSeconds: 4, rangeStartSeconds: 2 },
    args.canvas,
    args.context,
    args.loadedImages,
    args.videoEncoder,
    args.throwIfPipelineFailed,
    undefined,
    2_000_000,
    [
      'offscreenExport.hybridCompositeSpanRender',
      'offscreenExport.hybridCompositeReasonPrefix',
      'offscreenExport.hybridCompositeReasonCursorOverlay',
    ].join(' ')
  );
});

it('falls back to frame-driven rendering when clean-span encoding is unsupported', async () => {
  const cleanSpan = {
    kind: 'clean-source',
    start: 1,
    end: 3,
    sourceStart: 1,
    sourceEnd: 3,
    asset: { id: 'asset-1', metadata: { mimeType: 'video/mp4' } },
    clip: { id: 'clip-1' },
  };
  planMp4VideoRenderSpansMock.mockReturnValue([cleanSpan]);
  encodeCleanSourceMp4SpanMock.mockResolvedValueOnce(false);
  const args = createArgs();

  await runMp4HybridVideoPipeline(args as never);

  expect(runFrameDrivenCompositeRenderLoopMock).toHaveBeenCalledWith(
    args.job,
    args.project,
    { ...args.settings, rangeEndSeconds: 3, rangeStartSeconds: 1 },
    args.canvas,
    args.context,
    args.loadedImages,
    args.videoEncoder,
    args.throwIfPipelineFailed,
    undefined,
    1_000_000,
    'offscreenExport.hybridCleanSpanFallback'
  );
});

it('falls back to frame-driven rendering when clean-span decoding fails', async () => {
  const cleanSpan = {
    kind: 'clean-source',
    start: 1,
    end: 3,
    sourceStart: 1,
    sourceEnd: 3,
    asset: { id: 'asset-1', metadata: { mimeType: 'video/mp4' } },
    clip: { id: 'clip-1' },
  };
  planMp4VideoRenderSpansMock.mockReturnValue([cleanSpan]);
  encodeCleanSourceMp4SpanMock.mockRejectedValueOnce(new Error('decode failed'));
  const args = createArgs();

  await runMp4HybridVideoPipeline(args as never);

  expect(runFrameDrivenCompositeRenderLoopMock).toHaveBeenCalledOnce();
});

it('rethrows abort-like clean-span failures', async () => {
  const abort = new DOMException('The export was aborted.', 'AbortError');
  planMp4VideoRenderSpansMock.mockReturnValue([
    {
      kind: 'clean-source',
      start: 0,
      end: 1,
      sourceStart: 0,
      sourceEnd: 1,
      asset: { id: 'asset-1', metadata: { mimeType: 'video/mp4' } },
      clip: { id: 'clip-1' },
    },
  ]);
  encodeCleanSourceMp4SpanMock.mockRejectedValueOnce(abort);

  await expect(runMp4HybridVideoPipeline(createArgs() as never)).rejects.toThrow('aborted');
  expect(runFrameDrivenCompositeRenderLoopMock).not.toHaveBeenCalled();
});

it('renders accelerated composite spans without frame-driven fallback', async () => {
  const acceleratedSpan = {
    kind: 'accelerated-composite',
    reason: 'webm-frame-provider',
    start: 0,
    end: 2,
  };
  planMp4VideoRenderSpansMock.mockReturnValue([acceleratedSpan]);
  const args = createArgs();

  await runMp4HybridVideoPipeline(args as never);

  expect(renderAcceleratedCompositeWebmSpanMock).toHaveBeenCalledWith(
    expect.objectContaining({ span: acceleratedSpan, videoEncoder: args.videoEncoder })
  );
  expect(encodeCleanSourceMp4SpanMock).not.toHaveBeenCalled();
  expect(runFrameDrivenCompositeRenderLoopMock).not.toHaveBeenCalled();
});

it('falls back to frame-driven rendering when accelerated composite is unavailable', async () => {
  const acceleratedSpan = {
    kind: 'accelerated-composite',
    reason: 'webm-frame-provider',
    start: 1,
    end: 3,
  };
  planMp4VideoRenderSpansMock.mockReturnValue([acceleratedSpan]);
  renderAcceleratedCompositeWebmSpanMock.mockResolvedValueOnce(false);
  const args = createArgs();

  await runMp4HybridVideoPipeline(args as never);

  expect(runFrameDrivenCompositeRenderLoopMock).toHaveBeenCalledWith(
    args.job,
    args.project,
    { ...args.settings, rangeEndSeconds: 3, rangeStartSeconds: 1 },
    args.canvas,
    args.context,
    args.loadedImages,
    args.videoEncoder,
    args.throwIfPipelineFailed,
    undefined,
    1_000_000,
    'offscreenExport.hybridAcceleratedCompositeFallback'
  );
});

it('does not mask cancellation before rendering the next span', async () => {
  planMp4VideoRenderSpansMock.mockReturnValue([
    { kind: 'composite', reason: 'visible-clips', start: 0, end: 1 },
  ]);
  const args = createArgs();
  args.job.cancelled = true;

  await expect(runMp4HybridVideoPipeline(args as never)).rejects.toThrow(
    'PROJECT_EXPORT_CANCELLED'
  );
  expect(runFrameDrivenCompositeRenderLoopMock).not.toHaveBeenCalled();
});
