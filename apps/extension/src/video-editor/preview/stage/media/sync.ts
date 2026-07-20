import { shouldRefreshMediaTime } from '../../../../features/video/project/playback-sync';

const PREVIEW_PLAYING_SYNC_BASE_THRESHOLD = 0.2;
const PREVIEW_PLAYING_SYNC_MIN_THRESHOLD = 0.35;
const PREVIEW_PLAYING_SYNC_RATE_FACTOR = 0.15;
const PREVIEW_PLAYING_SYNC_MAX_THRESHOLD = 1.1;
const PREVIEW_TIMELINE_JUMP_THRESHOLD = 0.35;

export interface PreviewMediaSyncState {
  lastTimelineTime: number | null;
  wasPlaying: boolean;
}

function normalizePlaybackRate(playbackRate: number): number {
  return Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
}

function resolvePreviewPlayingSyncThreshold(playbackRate: number): number {
  return Math.min(
    PREVIEW_PLAYING_SYNC_MAX_THRESHOLD,
    Math.max(
      PREVIEW_PLAYING_SYNC_MIN_THRESHOLD,
      PREVIEW_PLAYING_SYNC_BASE_THRESHOLD +
        normalizePlaybackRate(playbackRate) * PREVIEW_PLAYING_SYNC_RATE_FACTOR
    )
  );
}

function isTimelineJump(state: PreviewMediaSyncState, currentTime: number): boolean {
  return (
    state.lastTimelineTime !== null &&
    Math.abs(currentTime - state.lastTimelineTime) > PREVIEW_TIMELINE_JUMP_THRESHOLD
  );
}

export function createPreviewMediaSyncState(): PreviewMediaSyncState {
  return {
    lastTimelineTime: null,
    wasPlaying: false,
  };
}

export function updatePreviewMediaSyncState(
  state: PreviewMediaSyncState,
  currentTime: number,
  isPlaying: boolean
): void {
  state.lastTimelineTime = currentTime;
  state.wasPlaying = isPlaying;
}

export function shouldRefreshPreviewMediaTime(params: {
  currentTime: number;
  isPlaying: boolean;
  mediaCurrentTime: number;
  mediaPaused: boolean;
  nextTime: number;
  playbackRate: number;
  state: PreviewMediaSyncState;
}): boolean {
  if (!params.isPlaying) {
    return shouldRefreshMediaTime({
      currentTime: params.mediaCurrentTime,
      isPlaying: false,
      nextTime: params.nextTime,
      playbackRate: params.playbackRate,
    });
  }

  if (!Number.isFinite(params.mediaCurrentTime)) {
    return true;
  }

  if (
    (!params.state.wasPlaying && params.mediaPaused) ||
    isTimelineJump(params.state, params.currentTime)
  ) {
    return true;
  }

  return (
    Math.abs(params.mediaCurrentTime - params.nextTime) >
    resolvePreviewPlayingSyncThreshold(params.playbackRate)
  );
}
