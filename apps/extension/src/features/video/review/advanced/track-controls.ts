import type { QuickEditAdvancedState, QuickEditTrack, QuickEditUiState } from './types';

/** Resolves independent lane masters while retaining legacy grouped audio settings. */
export function reviewTrackEnabled(ui: QuickEditUiState, track: QuickEditTrack): boolean {
  if (track === 'source') return true;
  if (track === 'voiceover' || track === 'music') return ui.tracks[track] ?? ui.tracks.audio;
  return ui.tracks[track] !== false;
}

/** Keeps legacy lane-level enable flags and the master in one persisted candidate. */
export function withReviewTrackEnabled(
  state: QuickEditAdvancedState,
  track: Exclude<QuickEditTrack, 'source'> | 'audio',
  enabled: boolean
): QuickEditAdvancedState {
  return {
    ...state,
    ...(track === 'actions' && state.ui.mode === 'advanced' ? { actionsEnabled: enabled } : {}),
    ...(track === 'zoom' ? { zoom: { ...state.zoom, enabled } } : {}),
    ...(track === 'annotationEffects' && state.annotationEffects
      ? { annotationEffects: { ...state.annotationEffects, enabled } }
      : {}),
    ...(track === 'webcam' && state.webcam ? { webcam: { ...state.webcam, enabled } } : {}),
    ui: {
      ...state.ui,
      tracks: {
        ...state.ui.tracks,
        [track]: enabled,
        ...(track === 'audio' ? { voiceover: enabled, music: enabled } : {}),
      },
    },
  };
}
