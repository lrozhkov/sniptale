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
    zoomApplied: advanced && state.zoom.enabled,
    backgroundApplied: advanced && state.background.enabled,
    originalAudioApplied: advanced,
    voiceoverApplied: advanced,
    musicApplied: advanced,
  };
}

export type QuickEditExportBlocker =
  | 'zoom'
  | 'background'
  | 'burned-comment'
  | 'voiceover'
  | 'music'
  | 'original-audio';

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

type QuickEditExportSupport =
  | { ok: true }
  | { ok: false; blockers: readonly QuickEditExportBlocker[] };

/**
 * Honest export-plan gate: the current packet exporter only carries cuts, speed,
 * and source-audio remux. Everything that changes rendered pixels or adds audio
 * must block the fast path with a user-visible reason instead of silently
 * exporting the untouched original.
 */
export function resolveQuickEditExportSupport(args: {
  document: Pick<ReviewDocument, 'edits' | 'canvasComments'>;
  advanced: QuickEditAdvancedState;
}): QuickEditExportSupport {
  if (args.advanced.ui.mode !== 'advanced') return { ok: true };
  const blockers: QuickEditExportBlocker[] = [];
  if (args.advanced.zoom.enabled) blockers.push('zoom');
  if (args.advanced.background.enabled) blockers.push('background');
  if (args.document.canvasComments.some((comment) => comment.renderToVideo))
    blockers.push('burned-comment');
  if (args.advanced.audio.voiceover.length > 0) blockers.push('voiceover');
  if (args.advanced.audio.music.length > 0) blockers.push('music');
  if (args.advanced.audio.original.muted || args.advanced.audio.original.volume !== 1)
    blockers.push('original-audio');
  return blockers.length ? { ok: false, blockers } : { ok: true };
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
