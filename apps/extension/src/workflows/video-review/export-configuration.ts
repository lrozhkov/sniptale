import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import {
  resolveQuickEditExportPlan,
  resolveQuickEditEffectiveState,
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
    includeBookends?: boolean;
    index: ReviewMediaIndex | null;
    renderSettings?: ReviewRenderSettings | undefined;
  }
): QuickEditExportPlan {
  const { index } = args;
  const presentation = args.advanced.presentation;
  const advanced =
    args.includeBookends === false && presentation
      ? {
          ...args.advanced,
          presentation: createNeutralPresentationSettings(),
        }
      : args.advanced;
  const settings = advanced.ui.mode === 'advanced' ? args.renderSettings : undefined;
  const output = index ? resolveReviewOutputProfile(index, advanced, settings) : null;
  if (output && !output.dimensionsSupported)
    return { kind: 'unavailable', reasons: ['canvas-size'] };
  const codec = output?.codec;
  const videoAvailable = !!(
    index &&
    output &&
    output.dimensionsSupported &&
    codec &&
    reviewOutputCodecs(index, output.format).includes(codec)
  );
  const audioCodec =
    index && output
      ? (index.outputAudioCodecs?.[output.format] ??
        (output.format === index.container ? index.processedAudioCodec : null))
      : null;
  const presentationAudioPresent =
    args.presentationAudioPresent ?? composedAudioPresence({ ...args, advanced });
  const plan = resolveQuickEditExportPlan({
    ...args,
    advanced,
    ...(index?.audioCodec ||
    presentationAudioPresent === true ||
    (resolveQuickEditEffectiveState(advanced).actionsApplied && args.actionAudioPresent)
      ? { audioProcessingAvailable: !!audioCodec }
      : {}),
    ...(presentationAudioPresent === undefined ? {} : { presentationAudioPresent }),
    videoRenderAvailable: videoAvailable,
  });
  if (plan.kind === 'unavailable') return plan;
  const profileRequiresRender = !!(
    settings &&
    index &&
    output &&
    (settings.quality !== undefined ||
      output.format !== index.container ||
      (settings.codec !== undefined && settings.codec !== index.videoCodec) ||
      (settings.resolution !== undefined &&
        settings.resolution !== 'SOURCE' &&
        (output.width !== (index.width ?? 1920) || output.height !== (index.height ?? 1080))) ||
      settings.frameRate !== 0 ||
      settings.frameRateMode === 'adaptive')
  );
  if (!profileRequiresRender) return plan;
  if (!videoAvailable) return { kind: 'unavailable', reasons: ['video-encoder'] };
  const transcodeAudio = output?.format === 'webm' && index?.audioCodec === 'aac';
  if (transcodeAudio && !audioCodec) return { kind: 'unavailable', reasons: ['audio-encoder'] };
  return { ...plan, video: 'render', audio: transcodeAudio ? 'process' : plan.audio };
}

/** A main-video index cannot establish whether an uninspected bookend has audio. */
function composedAudioPresence(
  args: Parameters<typeof configuredReviewExportPlan>[0]
): boolean | undefined {
  const effective = resolveQuickEditEffectiveState(args.advanced);
  if (
    args.index?.audioCodec ||
    effective.voiceover.length ||
    effective.music.length ||
    (effective.actionsApplied && args.actionAudioPresent)
  )
    return true;
  if (!effective.presentation) return undefined;
  const settings = effective.presentation;
  const possibleBookendAudio =
    settings &&
    [settings.intro, settings.outro].some(
      (slot) => slot.mode === 'video' && !slot.video.audio.muted && slot.video.audio.gain > 0
    );
  return !args.index || possibleBookendAudio ? undefined : false;
}
