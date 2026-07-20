const PAUSED_MEDIA_SYNC_THRESHOLD = 0.01;
const PLAYING_MEDIA_SYNC_BASE_THRESHOLD = 0.08;
const PLAYING_MEDIA_SYNC_MIN_THRESHOLD = 0.18;
const PLAYING_MEDIA_SYNC_RATE_FACTOR = 0.12;
const PLAYING_MEDIA_SYNC_MAX_THRESHOLD = 0.6;

function normalizePlaybackRate(playbackRate: number): number {
  return Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
}

function resolveMediaSyncThreshold(isPlaying: boolean, playbackRate: number): number {
  if (!isPlaying) {
    return PAUSED_MEDIA_SYNC_THRESHOLD;
  }

  return Math.min(
    PLAYING_MEDIA_SYNC_MAX_THRESHOLD,
    Math.max(
      PLAYING_MEDIA_SYNC_MIN_THRESHOLD,
      PLAYING_MEDIA_SYNC_BASE_THRESHOLD +
        normalizePlaybackRate(playbackRate) * PLAYING_MEDIA_SYNC_RATE_FACTOR
    )
  );
}

export function shouldRefreshMediaTime(params: {
  currentTime: number;
  isPlaying: boolean;
  nextTime: number;
  playbackRate: number;
}): boolean {
  if (!Number.isFinite(params.currentTime)) {
    return true;
  }

  return (
    Math.abs(params.currentTime - params.nextTime) >
    resolveMediaSyncThreshold(params.isPlaying, params.playbackRate)
  );
}
