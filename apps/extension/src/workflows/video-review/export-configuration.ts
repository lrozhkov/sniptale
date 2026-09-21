import {
  resolveQuickEditExportPlan,
  type QuickEditExportPlan,
} from '../../features/video/review/advanced/effective';
import type { ReviewMediaIndex, ReviewRenderSettings } from './media-index';
import { resolveReviewOutputProfile, reviewOutputCodecs } from './render-settings';

/** One plan for UI and publication: advanced export applies the selected encoding profile. */
export function configuredReviewExportPlan(
  args: Omit<
    Parameters<typeof resolveQuickEditExportPlan>[0],
    'audioProcessingAvailable' | 'videoRenderAvailable'
  > & {
    index: ReviewMediaIndex | null;
    renderSettings?: ReviewRenderSettings | undefined;
  }
): QuickEditExportPlan {
  const { index, advanced } = args;
  const settings = advanced.ui.mode === 'advanced' ? args.renderSettings : undefined;
  const output = index ? resolveReviewOutputProfile(index, advanced, settings) : null;
  const codec = output?.codec;
  const videoAvailable = !!(
    index &&
    output &&
    codec &&
    reviewOutputCodecs(index, output.format).includes(codec)
  );
  const audioCodec =
    index && output
      ? (index.outputAudioCodecs?.[output.format] ??
        (output.format === index.container ? index.processedAudioCodec : null))
      : null;
  const plan = resolveQuickEditExportPlan({
    ...args,
    ...(index?.audioCodec ? { audioProcessingAvailable: !!audioCodec } : {}),
    videoRenderAvailable: videoAvailable,
  });
  if (plan.kind === 'unavailable') return plan;
  if (!settings) return plan;
  if (!videoAvailable) return { kind: 'unavailable', reasons: ['video-encoder'] };
  const transcodeAudio = output?.format === 'webm' && index?.audioCodec === 'aac';
  if (transcodeAudio && !audioCodec) return { kind: 'unavailable', reasons: ['audio-encoder'] };
  return { ...plan, video: 'render', audio: transcodeAudio ? 'process' : plan.audio };
}
