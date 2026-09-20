import { projectReviewVoiceover } from '../voiceover-edits';
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
  /** In-frame comments are unavailable; stored comment data remains intact. */
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
    overlaysVisible: false,
    zoomApplied: advanced && state.ui.tracks.zoom && state.zoom.enabled,
    backgroundApplied: advanced && state.background.enabled,
    originalAudioApplied: advanced,
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
    zoomRegions: (features.zoomApplied ? state.zoom.regions : []).filter(
      (region) => !region.dormant
    ),
    background: advanced ? state.background : { enabled: false },
    canvas: advanced ? state.canvas : undefined,
    originalAudio: advanced ? state.audio.original : { muted: false, volume: 1 },
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
      .map((clip) => ({ ...clip, volume: clip.volume * (state.audio.laneVolumes?.music ?? 1) })),
  };
}

export type QuickEditExportReason =
  | 'canvas'
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
 * Export decisions follow effective track enablement and stored content. Visual
 * changes route to the frame renderer; audio-only changes require audio encoding.
 */
export function resolveQuickEditExportPlan(args: {
  document: Pick<ReviewDocument, 'edits' | 'canvasComments'>;
  advanced: QuickEditAdvancedState;
  /** Capability hint; undefined defers the authoritative check to the exporter. */
  audioProcessingAvailable?: boolean;
  videoRenderAvailable?: boolean;
  videoCopyBoundaries?: readonly number[];
}): QuickEditExportPlan {
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
  const features = resolveQuickEditEffectiveFeatures(args.advanced);
  const audio: QuickEditExportReason[] = [];
  if (features.voiceoverApplied && args.advanced.audio.voiceover.length > 0)
    audio.push('voiceover');
  if (features.musicApplied && args.advanced.audio.music.length > 0) audio.push('music');
  if (
    args.advanced.audio.original.muted ||
    args.advanced.audio.original.volume !== 1 ||
    args.advanced.audio.original.ranges?.length
  )
    audio.push('original-audio');
  const visual: QuickEditExportReason[] = preciseEdits ? ['precise-edits'] : [];
  if (args.advanced.canvas) visual.push('canvas');
  if (features.zoomApplied && args.advanced.zoom.regions.some((region) => !region.dormant))
    visual.push('zoom');
  if (args.advanced.background.enabled) visual.push('background');
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
    !!state.canvas ||
    state.zoom.regions.length > 0 ||
    state.background.enabled ||
    state.audio.voiceover.length > 0 ||
    state.audio.music.length > 0 ||
    state.audio.original.muted ||
    state.audio.original.volume !== 1 ||
    !!state.audio.original.ranges?.length
  );
}
