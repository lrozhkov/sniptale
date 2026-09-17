import type { QuickEditAdvancedState } from './types';

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

/** Non-empty advanced content worth a "saved and temporarily not applied" hint. */
export function hasSuppressedAdvancedFeatures(state: QuickEditAdvancedState): boolean {
  return (
    state.zoom.regions.length > 0 ||
    state.background.enabled ||
    state.audio.voiceover.length > 0 ||
    state.audio.music.length > 0
  );
}
