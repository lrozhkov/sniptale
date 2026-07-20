import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getClipEndTime,
  getSortedTracks,
  getTrackClips,
  getVideoClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
  isVisualClip,
} from '../../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../../features/video/project/timeline/rate';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import {
  createPreviewMediaSyncState,
  shouldRefreshPreviewMediaTime,
  updatePreviewMediaSyncState,
} from '../media/sync';
import type { PreviewStageVideoSyncParams } from '../types';

const logger = createLogger({ namespace: 'VideoEditorPreview' });
const PREVIEW_STAGE_VIDEO_WARMUP_SECONDS = 0.5;

function stringifyPreviewError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function playPreviewVideoBestEffort(video: HTMLVideoElement, clipId: string): void {
  void video.play().catch((error) => {
    logger.debug('Preview stage video play() rejected', {
      clipId,
      errorMessage: stringifyPreviewError(error),
    });
  });
}

function mutePreviewVideo(video: HTMLVideoElement): void {
  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
}

function pauseInactivePreviewVideos(
  syncedIds: Set<string>,
  videoRefs: PreviewStageVideoSyncParams['videoRefs']
): void {
  Object.entries(videoRefs.current).forEach(([clipId, element]) => {
    if (!element || syncedIds.has(clipId)) {
      return;
    }

    mutePreviewVideo(element);
    element.pause();
  });
}

function syncPreviewVideoElement(params: {
  clip: VideoProjectVideoClip;
  currentTime: number;
  isPlaying: boolean;
  isVideoActive: boolean;
  state: ReturnType<typeof createPreviewMediaSyncState>;
  video: HTMLVideoElement;
}): void {
  const { clip, currentTime, isPlaying, isVideoActive, state, video } = params;
  const nextTime = getVideoClipSourceTime(clip, currentTime);
  const playbackRate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);

  mutePreviewVideo(video);
  video.playbackRate = playbackRate;
  if (
    shouldRefreshPreviewMediaTime({
      currentTime,
      isPlaying,
      mediaCurrentTime: video.currentTime,
      mediaPaused: video.paused,
      nextTime,
      playbackRate,
      state,
    })
  ) {
    video.currentTime = nextTime;
  }

  if (isVideoActive && video.paused) {
    playPreviewVideoBestEffort(video, clip.id);
  }

  if (!isVideoActive && !video.paused) {
    video.pause();
  }
}

export function useActivePreviewClips(project: VideoProject, currentTime: number) {
  return useMemo(() => {
    const result: VideoProjectClip[] = [];
    const sortedTracks = getSortedTracks(project).toReversed();

    for (const track of sortedTracks) {
      if (!track.visible) {
        continue;
      }

      const clips = getTrackClips(project, track.id);
      for (const clip of clips) {
        if (isVisualClip(clip) && isClipActiveAtTime(clip, currentTime)) {
          result.push(clip);
        }
      }
    }

    return result;
  }, [currentTime, project]);
}

export function usePreviewStageVideoSync(params: PreviewStageVideoSyncParams) {
  const { activeClips, currentTime, isPlaying, syncedClips, videoRefs } = params;
  const mediaSyncStateRef = useRef(createPreviewMediaSyncState());

  useLayoutEffect(() => {
    const activeIds = new Set(activeClips.filter(isVideoClip).map((clip) => clip.id));
    const syncedVideoClips = syncedClips.filter(isVideoClip);
    const syncedIds = new Set(syncedVideoClips.map((clip) => clip.id));

    pauseInactivePreviewVideos(syncedIds, videoRefs);

    for (const clip of syncedVideoClips) {
      const video = videoRefs.current[clip.id];
      if (!video) {
        continue;
      }

      syncPreviewVideoElement({
        clip,
        currentTime,
        isPlaying,
        isVideoActive: isPlaying && activeIds.has(clip.id),
        state: mediaSyncStateRef.current,
        video,
      });
    }

    updatePreviewMediaSyncState(mediaSyncStateRef.current, currentTime, isPlaying);
  }, [activeClips, currentTime, isPlaying, syncedClips, videoRefs]);

  useEffect(() => {
    const videos = videoRefs.current;

    return () => {
      Object.values(videos).forEach((video) => video?.pause());
    };
  }, [videoRefs]);
}

export function usePreviewStageVideoBankClips(
  project: VideoProject,
  currentTime: number,
  activeClips: VideoProjectClip[]
) {
  return useMemo(() => {
    const bankedClipIds = new Set(activeClips.filter(isVideoClip).map((clip) => clip.id));
    const bankClips = activeClips.filter(isVideoClip);

    for (const track of getSortedTracks(project)) {
      if (!track.visible) {
        continue;
      }

      for (const clip of getTrackClips(project, track.id)) {
        if (!isVideoClip(clip) || bankedClipIds.has(clip.id)) {
          continue;
        }

        const warmupStart = clip.startTime - PREVIEW_STAGE_VIDEO_WARMUP_SECONDS;
        const warmupEnd = getClipEndTime(clip) + PREVIEW_STAGE_VIDEO_WARMUP_SECONDS;
        if (currentTime < warmupStart || currentTime >= warmupEnd) {
          continue;
        }

        bankedClipIds.add(clip.id);
        bankClips.push(clip);
      }
    }

    return bankClips;
  }, [activeClips, currentTime, project]);
}
