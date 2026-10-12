import { resolvePresentationSettings } from './presentation';
import { resolveOriginalSourceAudio } from './original-audio-mutes';
import { projectReviewVoiceover } from '../voiceover-edits';
import { projectReviewFocus } from '../focus-edits';
import { reviewVisibleEditBoundaries } from '../timeline';
import type { ReviewDocument } from '../types';
import type {
  QuickEditAdvancedState,
  QuickEditAudioClip,
  QuickEditBackgroundSettings,
  QuickEditCanvasSize,
  QuickEditOriginalAudio,
  QuickEditZoomRegion,
} from './types';

interface QuickEditEffectiveFeatures {
  mode: 'basic' | 'advanced';
  /** Track toggles control both visibility and application; original audio is independent. */
  actionsTrackVisible: boolean;
  zoomTrackVisible: boolean;
  audioTrackVisible: boolean;
  webcamTrackVisible: boolean;
  annotationEffectsTrackVisible: boolean;
  /** In-frame comments follow the advanced-mode overlay visibility control. */
  overlaysVisible: boolean;
  /** Advanced effects are suppressed while the editor is in basic mode. */
  actionsApplied: boolean;
  webcamApplied: boolean;
  watermarkApplied: boolean;
  captionsApplied: boolean;
  annotationEffectsApplied: boolean;
  presentationApplied: boolean;
  zoomApplied: boolean;
  backgroundApplied: boolean;
  originalAudioApplied: boolean;
  voiceoverApplied: boolean;
  musicApplied: boolean;
}

/**
 * Single derivation from editor mode to effective features: basic mode temporarily
 * suppresses advanced presentation without mutating any persisted state.
 */
export function resolveQuickEditEffectiveFeatures(
  state: QuickEditAdvancedState
): QuickEditEffectiveFeatures {
  const advanced = state.ui.mode === 'advanced';
  return {
    mode: state.ui.mode,
    actionsTrackVisible: state.ui.tracks.actions,
    zoomTrackVisible: advanced && state.ui.tracks.zoom,
    audioTrackVisible: advanced && state.ui.tracks.audio,
    webcamTrackVisible: advanced && !!state.webcam && state.ui.tracks.webcam !== false,
    webcamApplied: advanced && !!state.webcam?.enabled && state.ui.tracks.webcam !== false,
    annotationEffectsTrackVisible: advanced && state.ui.tracks.annotationEffects !== false,
    annotationEffectsApplied:
      advanced &&
      state.ui.tracks.annotationEffects !== false &&
      !!state.annotationEffects?.enabled &&
      state.annotationEffects.instances.some((instance) => instance.enabled),
    watermarkApplied:
      advanced &&
      (state.watermark?.mode === 'text' ||
        (state.watermark?.mode === 'image' && !!state.watermark.image)),
    captionsApplied:
      advanced &&
      !!state.captions?.enabled &&
      !!state.text?.fragments.some((fragment) => fragment.showInVideo && fragment.text.trim()),
    presentationApplied: advanced && hasPresentationEffects(state),
    actionsApplied: advanced && state.ui.tracks.actions && state.actionsEnabled !== false,
    overlaysVisible: advanced && state.ui.overlaysVisible,
    zoomApplied: advanced && state.ui.tracks.zoom && state.zoom.enabled,
    backgroundApplied: advanced && state.background.enabled,
    originalAudioApplied: true,
    voiceoverApplied: advanced && state.ui.tracks.audio,
    musicApplied: advanced && state.ui.tracks.audio,
  };
}

/**
 * Applied configuration for stage, mixer, and exporter: every render/audio branch
 * consumes this instead of interpreting stored settings independently.
 */
interface QuickEditEffectiveState extends QuickEditEffectiveFeatures {
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditBackgroundSettings;
  canvas: QuickEditCanvasSize | undefined;
  windowHeader: QuickEditAdvancedState['windowHeader'];
  webcam: QuickEditAdvancedState['webcam'];
  watermark: QuickEditAdvancedState['watermark'];
  captions: QuickEditAdvancedState['captions'];
  text: QuickEditAdvancedState['text'];
  presentation: QuickEditAdvancedState['presentation'];
  annotationEffects: QuickEditAdvancedState['annotationEffects'];
  originalAudio: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
}

/** Derives the applied configuration without mutating the stored document. */
export function resolveQuickEditEffectiveState(
  state: QuickEditAdvancedState
): QuickEditEffectiveState {
  const advanced = state.ui.mode === 'advanced';
  const features = resolveQuickEditEffectiveFeatures(state);
  return {
    ...features,
    zoomRegions: projectReviewFocus(
      features.zoomApplied ? state.zoom.regions : [],
      state.audio.voiceoverSegments
    ),
    background: advanced ? state.background : { enabled: false },
    canvas: advanced ? state.canvas : undefined,
    windowHeader: advanced ? state.windowHeader : undefined,
    webcam: features.webcamApplied ? state.webcam : undefined,
    watermark: features.watermarkApplied ? state.watermark : undefined,
    captions: features.captionsApplied ? state.captions : undefined,
    text: features.captionsApplied ? state.text : undefined,
    annotationEffects: features.annotationEffectsApplied ? state.annotationEffects : undefined,
    presentation:
      features.presentationApplied && state.presentation
        ? resolvePresentationSettings(state.presentation)
        : undefined,
    originalAudio: resolveOriginalSourceAudio(state.audio, features.voiceoverApplied),
    voiceover: projectReviewVoiceover(
      features.voiceoverApplied ? state.audio.voiceover : [],
      state.audio.voiceoverSegments
    )
      .filter((clip) => !clip.dormant)
      .map((clip) => ({
        ...clip,
        volume: clip.volume * (state.audio.laneVolumes?.voiceover ?? 1),
      })),
    music: (features.musicApplied ? state.audio.music : [])
      .filter((clip) => !clip.dormant)
      .filter((clip) => {
        const last = state.audio.voiceoverSegments?.at(-1);
        return !last || clip.timelineStart < last.resultEnd;
      })
      .map((clip) => ({ ...clip, volume: clip.volume * (state.audio.laneVolumes?.music ?? 1) })),
  };
}

export type QuickEditExportReason =
  | 'canvas'
  | 'window-header'
  | 'webcam'
  | 'watermark'
  | 'captions'
  | 'annotation-effects'
  | 'caption-layout'
  | 'presentation'
  | 'canvas-size'
  | 'precise-edits'
  | 'cut-transition'
  | 'transition-frames'
  | 'zoom'
  | 'background'
  | 'comments'
  | 'key-animations'
  | 'click-animations'
  | 'voiceover'
  | 'music'
  | 'action-audio'
  | 'action-audio-limit'
  | 'action-audio-resource'
  | 'original-audio'
  | 'audio-encoder'
  | 'video-encoder'
  | 'asset-missing';

export type QuickEditExportPlan =
  | { kind: 'unavailable'; reasons: readonly QuickEditExportReason[] }
  | {
      kind: 'ready';
      video: 'copy' | 'render';
      audio: 'copy' | 'process';
      reasons: readonly QuickEditExportReason[];
    };

/**
 * Export decisions follow effective track enablement and stored content. Visual
 * changes route to the frame renderer; audio-only changes require audio encoding.
 */
export function resolveQuickEditExportPlan(args: {
  document: Pick<ReviewDocument, 'edits' | 'canvasComments'>;
  advanced: QuickEditAdvancedState;
  /** Capability hint; undefined defers the authoritative check to the exporter. */
  audioProcessingAvailable?: boolean;
  /** Actual composed audio presence; undefined defers bookend track discovery to the writer. */
  presentationAudioPresent?: boolean;
  /** Actual retained main-time cues, resolved from immutable normalized telemetry. */
  actionAudioPresent?: boolean;
  videoRenderAvailable?: boolean;
  videoCopyBoundaries?: readonly number[];
}): QuickEditExportPlan {
  const preciseEdits =
    args.videoCopyBoundaries !== undefined &&
    reviewVisibleEditBoundaries(args.document.edits).some(
      (time) => !args.videoCopyBoundaries!.some((boundary) => Math.abs(boundary - time) < 0.000001)
    );
  const transitions = args.document.edits.some((edit) => edit.kind === 'cut' && edit.transition);
  const visual: QuickEditExportReason[] = preciseEdits ? ['precise-edits'] : [];
  if (transitions) visual.push('cut-transition');
  const features = resolveQuickEditEffectiveFeatures(args.advanced);
  const effective = resolveQuickEditEffectiveState(args.advanced);
  const audio: QuickEditExportReason[] = [];
  if (features.presentationApplied) {
    visual.push('presentation');
    const presentation = effective.presentation!;
    if (
      presentation.intro.mode !== 'none' ||
      presentation.outro.mode !== 'none' ||
      presentation.audioFade ||
      presentation.fadeIn.audioFade ||
      presentation.fadeOut.audioFade
    )
      audio.push('presentation');
  }
  if (features.voiceoverApplied && effective.voiceover.length > 0) audio.push('voiceover');
  if (features.musicApplied && effective.music.length > 0) audio.push('music');
  if (features.actionsApplied && args.actionAudioPresent) audio.push('action-audio');
  if (
    args.advanced.audio.original.muted ||
    args.advanced.audio.original.volume !== 1 ||
    effective.originalAudio.ranges?.some(
      (range) =>
        !args.advanced.audio.voiceoverSegments ||
        args.advanced.audio.voiceoverSegments.some(
          (part) =>
            part.kind !== 'cut' && range.start < part.sourceEnd && range.end > part.sourceStart
        )
    )
  )
    audio.push('original-audio');
  if (
    features.actionsApplied &&
    args.advanced.clickAnimations?.some((item) => item.effect !== 'off')
  )
    visual.push('click-animations');
  if (features.actionsApplied && args.advanced.keyAnimations?.some((item) => item.enabled))
    visual.push('key-animations');
  if (effective.canvas) visual.push('canvas');
  if (effective.windowHeader) visual.push('window-header');
  if (effective.webcam) visual.push('webcam');
  if (features.watermarkApplied) visual.push('watermark');
  if (features.captionsApplied) visual.push('captions');
  if (features.annotationEffectsApplied) visual.push('annotation-effects');
  if (features.zoomApplied && effective.zoomRegions.length > 0) visual.push('zoom');
  if (features.backgroundApplied) visual.push('background');
  if (
    features.overlaysVisible &&
    args.document.canvasComments.some((comment) => comment.visible && comment.renderToVideo)
  )
    visual.push('comments');
  if (visual.length) {
    if (args.videoRenderAvailable === false)
      return { kind: 'unavailable', reasons: ['video-encoder', ...audio] };
    if (
      audioEncoderRequired(audio, args.presentationAudioPresent) &&
      args.audioProcessingAvailable === false
    )
      return { kind: 'unavailable', reasons: ['audio-encoder'] };
    return {
      kind: 'ready',
      video: 'render',
      audio: audio.length ? 'process' : 'copy',
      reasons: [...new Set([...visual, ...audio])],
    };
  }
  if (audio.length) {
    if (
      audioEncoderRequired(audio, args.presentationAudioPresent) &&
      args.audioProcessingAvailable === false
    )
      return { kind: 'unavailable', reasons: ['audio-encoder'] };
    return { kind: 'ready', video: 'copy', audio: 'process', reasons: audio };
  }
  return { kind: 'ready', video: 'copy', audio: 'copy', reasons: [] };
}

/** Non-empty advanced content worth a "saved and temporarily not applied" hint. */
export function hasSuppressedAdvancedFeatures(state: QuickEditAdvancedState): boolean {
  return (
    hasPresentationEffects(state) ||
    !!state.keyAnimations?.some((item) => item.enabled) ||
    !!state.clickAnimations?.some((item) => item.effect !== 'off') ||
    !!state.actionAudio?.some((item) => item.enabled && item.presetId && item.volume > 0) ||
    !!state.canvas ||
    !!state.windowHeader ||
    !!state.webcam?.enabled ||
    !!state.annotationEffects?.instances.length ||
    (!!state.captions?.enabled &&
      !!state.text?.fragments.some((fragment) => fragment.showInVideo && fragment.text.trim())) ||
    state.watermark?.mode === 'text' ||
    (state.watermark?.mode === 'image' && !!state.watermark.image) ||
    state.zoom.regions.length > 0 ||
    state.background.enabled ||
    state.audio.voiceover.length > 0 ||
    state.audio.music.length > 0
  );
}

function hasPresentationEffects(state: QuickEditAdvancedState): boolean {
  const settings = state.presentation ? resolvePresentationSettings(state.presentation) : undefined;
  return (
    !!settings &&
    ((settings.fadeIn.enabled && settings.fadeIn.duration > 0) ||
      (settings.fadeOut.enabled && settings.fadeOut.duration > 0) ||
      settings.intro.mode !== 'none' ||
      settings.outro.mode !== 'none')
  );
}

function audioEncoderRequired(
  reasons: readonly QuickEditExportReason[],
  presentationAudioPresent: boolean | undefined
): boolean {
  return (
    reasons.some((reason) => reason !== 'presentation') ||
    (reasons.includes('presentation') && presentationAudioPresent === true)
  );
}
