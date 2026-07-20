import { translate } from '../../../../platform/i18n';
import { VideoProjectExportPhase } from '../../../../features/video/project/types/export';
import { runFrameDrivenCompositeRenderLoop } from '../../render-loop';
import { sendProgress } from '../../runtime';
import { encodeCleanSourceMp4Span } from './demux';
import { planMp4VideoRenderSpans } from './planner';
import { renderAcceleratedCompositeWebmSpan } from './webm';
import type {
  Mp4CompositeRenderReason,
  Mp4HybridVideoPipelineArgs,
  Mp4VideoRenderSpan,
} from './types';

const COMPOSITE_REASON_MESSAGE_KEY = {
  'asset-missing': 'offscreenExport.hybridCompositeReasonAssetMissing',
  'camera-motion': 'offscreenExport.hybridCompositeReasonCameraMotion',
  'cursor-overlay': 'offscreenExport.hybridCompositeReasonCursorOverlay',
  'export-size': 'offscreenExport.hybridCompositeReasonExportSize',
  mixed: 'offscreenExport.hybridCompositeReasonMixed',
  'non-mp4-asset': 'offscreenExport.hybridCompositeReasonNonMp4Asset',
  'playback-rate': 'offscreenExport.hybridCompositeReasonPlaybackRate',
  shadow: 'offscreenExport.hybridCompositeReasonShadow',
  'source-size': 'offscreenExport.hybridCompositeReasonSourceSize',
  subtitles: 'offscreenExport.hybridCompositeReasonSubtitles',
  transform: 'offscreenExport.hybridCompositeReasonTransform',
  transition: 'offscreenExport.hybridCompositeReasonTransition',
  'visual-effect': 'offscreenExport.hybridCompositeReasonVisualEffect',
  'visual-layer': 'offscreenExport.hybridCompositeReasonVisualLayer',
  'visible-clips': 'offscreenExport.hybridCompositeReasonVisibleClips',
} satisfies Record<Mp4CompositeRenderReason, Parameters<typeof translate>[0]>;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.message === 'PROJECT_EXPORT_CANCELLED')
  );
}

function createSpanSettings(
  args: Pick<Mp4HybridVideoPipelineArgs, 'settings'>,
  span: Mp4VideoRenderSpan
): Mp4HybridVideoPipelineArgs['settings'] {
  return {
    ...args.settings,
    rangeEndSeconds: span.end,
    rangeStartSeconds: span.start,
  };
}

async function sendHybridSpanProgress(
  args: Pick<Mp4HybridVideoPipelineArgs, 'job'>,
  span: Mp4VideoRenderSpan,
  spanIndex: number,
  totalSpans: number
): Promise<void> {
  await sendProgress(
    args.job.jobId,
    VideoProjectExportPhase.RENDERING,
    (spanIndex / Math.max(1, totalSpans)) * 100,
    getSpanProgressDetail(span)
  );
}

function getSpanProgressDetail(span: Mp4VideoRenderSpan): string {
  switch (span.kind) {
    case 'clean-source':
      return translate('offscreenExport.hybridCleanSpanRender');
    case 'accelerated-composite':
      return translate('offscreenExport.hybridAcceleratedCompositeRender');
    case 'composite':
      return getCompositeProgressDetail(span.reason);
  }
}

async function sendHybridPlanProgress(
  args: Pick<Mp4HybridVideoPipelineArgs, 'job'>,
  spans: Mp4VideoRenderSpan[]
): Promise<void> {
  let cleanSpanCount = 0;
  let acceleratedSpanCount = 0;
  for (const span of spans) {
    if (span.kind === 'clean-source') {
      cleanSpanCount += 1;
    } else if (span.kind === 'accelerated-composite') {
      acceleratedSpanCount += 1;
    }
  }
  const compositeSpanCount = spans.length - cleanSpanCount - acceleratedSpanCount;
  await sendProgress(
    args.job.jobId,
    VideoProjectExportPhase.RENDERING,
    0,
    [
      translate('offscreenExport.hybridPlanSummaryPrefix'),
      `${cleanSpanCount}`,
      translate('offscreenExport.hybridPlanCleanLabel'),
      `${acceleratedSpanCount}`,
      translate('offscreenExport.hybridPlanAcceleratedLabel'),
      `${compositeSpanCount}`,
      translate('offscreenExport.hybridPlanCompositeLabel'),
    ].join(' ')
  );
}

async function sendHybridFallbackProgress(
  args: Pick<Mp4HybridVideoPipelineArgs, 'job'>,
  spanIndex: number,
  totalSpans: number,
  message: string
): Promise<void> {
  await sendProgress(
    args.job.jobId,
    VideoProjectExportPhase.RENDERING,
    (spanIndex / Math.max(1, totalSpans)) * 100,
    message
  );
}

async function renderCompositeSpan(
  args: Mp4HybridVideoPipelineArgs,
  span: Mp4VideoRenderSpan,
  progressMessageDetail?: string
): Promise<void> {
  await runFrameDrivenCompositeRenderLoop(
    args.job,
    args.project,
    createSpanSettings(args, span),
    args.canvas,
    args.context,
    args.loadedImages,
    args.videoEncoder,
    args.throwIfPipelineFailed,
    args.signal,
    Math.round(span.start * 1_000_000),
    progressMessageDetail
  );
}

function getCompositeProgressDetail(reason: Mp4CompositeRenderReason): string {
  return [
    translate('offscreenExport.hybridCompositeSpanRender'),
    translate('offscreenExport.hybridCompositeReasonPrefix'),
    translate(COMPOSITE_REASON_MESSAGE_KEY[reason]),
  ].join(' ');
}

async function tryRenderCleanSourceSpan(
  args: Mp4HybridVideoPipelineArgs,
  span: Extract<Mp4VideoRenderSpan, { kind: 'clean-source' }>
): Promise<boolean> {
  try {
    const encoded = await encodeCleanSourceMp4Span({
      span,
      throwIfPipelineFailed: args.throwIfPipelineFailed,
      videoEncoder: args.videoEncoder,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    if (encoded) {
      return true;
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
  }

  return false;
}

async function tryRenderAcceleratedCompositeSpan(
  args: Mp4HybridVideoPipelineArgs,
  span: Extract<Mp4VideoRenderSpan, { kind: 'accelerated-composite' }>
): Promise<boolean> {
  try {
    return await renderAcceleratedCompositeWebmSpan({
      canvas: args.canvas,
      context: args.context,
      job: args.job,
      loadedImages: args.loadedImages,
      project: args.project,
      settings: args.settings,
      span,
      throwIfPipelineFailed: args.throwIfPipelineFailed,
      videoEncoder: args.videoEncoder,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
  }

  return false;
}

export async function runMp4HybridVideoPipeline(args: Mp4HybridVideoPipelineArgs): Promise<void> {
  const spans = planMp4VideoRenderSpans(args.project, args.settings);
  await sendHybridPlanProgress(args, spans);
  for (const [index, span] of spans.entries()) {
    if (args.job.cancelled || args.signal?.aborted) {
      throw new Error('PROJECT_EXPORT_CANCELLED');
    }

    await sendHybridSpanProgress(args, span, index, spans.length);
    if (span.kind === 'clean-source') {
      const renderedCleanSource = await tryRenderCleanSourceSpan(args, span);
      if (!renderedCleanSource) {
        const fallbackMessage = translate('offscreenExport.hybridCleanSpanFallback');
        await sendHybridFallbackProgress(args, index, spans.length, fallbackMessage);
        await renderCompositeSpan(args, span, translate('offscreenExport.hybridCleanSpanFallback'));
      }
      continue;
    }

    if (span.kind === 'accelerated-composite') {
      const renderedAcceleratedComposite = await tryRenderAcceleratedCompositeSpan(args, span);
      if (!renderedAcceleratedComposite) {
        const fallbackMessage = translate('offscreenExport.hybridAcceleratedCompositeFallback');
        await sendHybridFallbackProgress(args, index, spans.length, fallbackMessage);
        await renderCompositeSpan(args, span, fallbackMessage);
      }
      continue;
    }

    await renderCompositeSpan(args, span, getCompositeProgressDetail(span.reason));
  }
}
