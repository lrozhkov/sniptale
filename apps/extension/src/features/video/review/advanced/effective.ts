import type { ReviewDocument } from '../types';
import type {
  QuickEditAdvancedState,
  QuickEditAudioClip,
  QuickEditBackgroundSettings,
  QuickEditOriginalAudio,
  QuickEditZoomRegion,
} from './types';

interface QuickEditEffectiveFeatures {
  mode: 'basic' | 'advanced';
  /** Track visibility is layout-only and never turns an effect off. */
  actionsTrackVisible: boolean;
  zoomTrackVisible: boolean;
  audioTrackVisible: boolean;
  /** Editor-only overlay display toggle; never mutates comment data or exports. */
  overlaysVisible: boolean;
  /** Advanced effects are suppressed while the editor is in basic mode. */
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
    overlaysVisible: advanced && state.ui.overlaysVisible,
    zoomApplied: advanced && state.zoom.enabled,
    backgroundApplied: advanced && state.background.enabled,
    originalAudioApplied: advanced,
    voiceoverApplied: advanced,
    musicApplied: advanced,
  };
}

/**
 * Applied configuration for stage, mixer, and exporter: every render/audio branch
 * consumes this instead of the stored state or lane visibility.
 */
interface QuickEditEffectiveState extends QuickEditEffectiveFeatures {
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditBackgroundSettings;
  originalAudio: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
}

/** Derives the applied configuration without mutating the stored document. */
export function resolveQuickEditEffectiveState(
  state: QuickEditAdvancedState
): QuickEditEffectiveState {
  const advanced = state.ui.mode === 'advanced';
  return {
    ...resolveQuickEditEffectiveFeatures(state),
    zoomRegions: (advanced && state.zoom.enabled ? state.zoom.regions : []).filter(
      (region) => !region.dormant
    ),
    background: advanced ? state.background : { enabled: false },
    originalAudio: advanced ? state.audio.original : { muted: false, volume: 1 },
    voiceover: (advanced ? state.audio.voiceover : []).filter((clip) => !clip.dormant),
    music: (advanced ? state.audio.music : []).filter((clip) => !clip.dormant),
  };
}

export type QuickEditExportReason =
  | 'precise-edits'
  | 'zoom'
  | 'background'
  | 'comments'
  | 'voiceover'
  | 'music'
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
 * Export decision from the applied configuration, not lane visibility or dormant
 * settings. Pixel-changing effects and burned overlays route to the full frame
 * renderer; audio-only changes are processable when the capability hint allows
 * audio encoding.
 */
export function resolveQuickEditExportPlan(args: {
  document: Pick<ReviewDocument, 'edits' | 'canvasComments'>;
  advanced: QuickEditAdvancedState;
  /** Capability hint; undefined defers the authoritative check to the exporter. */
  audioProcessingAvailable?: boolean;
  videoRenderAvailable?: boolean;
  videoCopyBoundaries?: readonly number[];
}): QuickEditExportPlan {
  const burned = args.document.canvasComments.some((comment) => comment.renderToVideo);
  const preciseEdits =
    args.videoCopyBoundaries !== undefined &&
    args.document.edits.some((edit) =>
      [edit.start, edit.end].some(
        (time) =>
          !args.videoCopyBoundaries!.some((boundary) => Math.abs(boundary - time) < 0.000001)
      )
    );
  if (args.advanced.ui.mode !== 'advanced') {
    if (preciseEdits)
      return args.videoRenderAvailable === false
        ? { kind: 'unavailable', reasons: ['video-encoder'] }
        : { kind: 'ready', video: 'render', audio: 'copy', reasons: ['precise-edits'] };
    return { kind: 'ready', video: 'copy', audio: 'copy', reasons: [] };
  }
  const audio: QuickEditExportReason[] = [];
  if (args.advanced.audio.voiceover.length > 0) audio.push('voiceover');
  if (args.advanced.audio.music.length > 0) audio.push('music');
  if (args.advanced.audio.original.muted || args.advanced.audio.original.volume !== 1)
    audio.push('original-audio');
  const visual: QuickEditExportReason[] = preciseEdits ? ['precise-edits'] : [];
  if (args.advanced.zoom.enabled) visual.push('zoom');
  if (args.advanced.background.enabled) visual.push('background');
  if (burned) visual.push('comments');
  if (visual.length) {
    if (args.videoRenderAvailable === false)
      return { kind: 'unavailable', reasons: ['video-encoder', ...audio] };
    if (audio.length && args.audioProcessingAvailable === false)
      return { kind: 'unavailable', reasons: ['audio-encoder'] };
    return {
      kind: 'ready',
      video: 'render',
      audio: audio.length ? 'process' : 'copy',
      reasons: [...visual, ...audio],
    };
  }
  if (audio.length) {
    if (args.audioProcessingAvailable === false)
      return { kind: 'unavailable', reasons: ['audio-encoder'] };
    return { kind: 'ready', video: 'copy', audio: 'process', reasons: audio };
  }
  return { kind: 'ready', video: 'copy', audio: 'copy', reasons: [] };
}

/** Non-empty advanced content worth a "saved and temporarily not applied" hint. */
export function hasSuppressedAdvancedFeatures(state: QuickEditAdvancedState): boolean {
  return (
    state.zoom.regions.length > 0 ||
    state.background.enabled ||
    state.audio.voiceover.length > 0 ||
    state.audio.music.length > 0 ||
    state.audio.original.muted ||
    state.audio.original.volume !== 1
  );
}
