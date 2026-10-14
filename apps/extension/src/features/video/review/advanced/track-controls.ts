import type { ReviewDocument } from '../types';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
  QuickEditTrack,
  QuickEditUiState,
} from './types';

/** Resolves independent lane masters while retaining legacy grouped audio settings. */
export function reviewTrackEnabled(ui: QuickEditUiState, track: QuickEditTrack): boolean {
  if (track === 'source') return true;
  if (track === 'voiceover' || track === 'music') return ui.tracks[track] ?? ui.tracks.audio;
  return ui.tracks[track] !== false;
}

/** Identifies authored lane changes. Scene properties and derived time maps are not lane edits. */
export function changedReviewContentTracks(
  before: QuickEditAdvancedContent,
  after: QuickEditAdvancedContent
): QuickEditTrack[] {
  const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
  const tracks: QuickEditTrack[] = [];
  if (
    changed(
      [before.actionsEnabled, before.keyAnimations, before.clickAnimations, before.actionAudio],
      [after.actionsEnabled, after.keyAnimations, after.clickAnimations, after.actionAudio]
    )
  )
    tracks.push('actions');
  if (
    changed(
      [before.zoom, before.cursorFocusPath, before.cameraFollowDefaults],
      [after.zoom, after.cursorFocusPath, after.cameraFollowDefaults]
    )
  )
    tracks.push('zoom');
  if (changed([before.text, before.captions], [after.text, after.captions])) tracks.push('text');
  if (changed(before.annotationEffects, after.annotationEffects)) tracks.push('annotationEffects');
  if (changed(before.webcam, after.webcam)) tracks.push('webcam');
  if (
    changed(
      [before.audio.original, before.audio.originalSpeech],
      [after.audio.original, after.audio.originalSpeech]
    )
  )
    tracks.push('originalAudio');
  for (const track of ['voiceover', 'music'] as const) {
    if (
      changed(before.audio[track], after.audio[track]) ||
      changed(before.audio.laneVolumes?.[track], after.audio.laneVolumes?.[track])
    )
      tracks.push(track);
  }
  return tracks;
}

/** Notes are independent of the source lane that displays their markers. */
export function changedReviewDocumentTracks(before: ReviewDocument, after: ReviewDocument) {
  const tracks = changedReviewContentTracks(before.advancedContent, after.advancedContent);
  if (JSON.stringify(before.edits) !== JSON.stringify(after.edits)) tracks.push('source');
  return tracks;
}

/** A command refusal does not invalidate the editor or suspend unrelated autosaves. */
export class ReviewTrackLockedError extends Error {
  constructor(readonly tracks: readonly QuickEditTrack[]) {
    super(`Review tracks are locked: ${tracks.join(', ')}.`);
    this.name = 'ReviewTrackLockedError';
  }
}

/** Checks the complete mutation before any lane changes or resource transfers. */
export function assertReviewTracksEditable(
  ui: QuickEditUiState,
  tracks: readonly QuickEditTrack[]
) {
  const locked = tracks.filter((track) => ui.lockedTracks?.[track]);
  if (locked.length) throw new ReviewTrackLockedError(locked);
}

/** History restores a legacy-backed master together with its authored enable flag. */
export function reviewHistoryTrackControls(
  ui: QuickEditUiState,
  before: QuickEditAdvancedContent,
  after: QuickEditAdvancedContent
): QuickEditUiState {
  const flags = (content: QuickEditAdvancedContent) => ({
    actions: content.actionsEnabled !== false,
    zoom: content.zoom.enabled,
    webcam: content.webcam?.enabled !== false,
    annotationEffects: content.annotationEffects?.enabled !== false,
  });
  const previous = flags(before);
  const next = flags(after);
  const tracks = { ...ui.tracks };
  for (const track of ['actions', 'zoom', 'webcam', 'annotationEffects'] as const) {
    if (previous[track] !== next[track]) tracks[track] = next[track];
  }
  return { ...ui, tracks };
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
