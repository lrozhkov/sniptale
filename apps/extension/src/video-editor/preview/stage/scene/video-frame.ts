import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { isVideoClip } from '../../../../features/video/project/timeline';
import type { VideoProjectClip } from '../../../../features/video/project/types/index';
import type { PreviewStageVideoRefs } from '../types';

const MEDIA_READY_FOR_CURRENT_FRAME = 2;

function resolveActiveVideoClipKey(activeClips: VideoProjectClip[]): string {
  return resolveActiveVideoClipIds(activeClips).join('|');
}

function resolveActiveVideoClipIds(activeClips: VideoProjectClip[]): string[] {
  const clipIds: string[] = [];
  for (const clip of activeClips) {
    if (isVideoClip(clip)) {
      clipIds.push(clip.id);
    }
  }
  return clipIds;
}

function parseActiveVideoClipIds(activeVideoClipKey: string): string[] {
  return activeVideoClipKey === '' ? [] : activeVideoClipKey.split('|');
}

function resolveCanRenderState(
  activeVideoClipIds: string[],
  videoRefs: PreviewStageVideoRefs
): boolean {
  if (activeVideoClipIds.length === 0) {
    return true;
  }

  return activeVideoClipIds.every((clipId) => {
    const video = videoRefs.current[clipId];
    return (
      video !== null &&
      video !== undefined &&
      video.readyState >= MEDIA_READY_FOR_CURRENT_FRAME &&
      Number.isFinite(video.currentTime)
    );
  });
}

export function canRenderActivePreviewVideos(
  activeClips: VideoProjectClip[],
  videoRefs: PreviewStageVideoRefs
): boolean {
  return resolveCanRenderState(resolveActiveVideoClipIds(activeClips), videoRefs);
}

function usePreviewStageVideoFrameStateSync(
  activeVideoClipIds: string[],
  currentTime: number,
  setVideoFrameState: Dispatch<
    SetStateAction<{
      canRender: boolean;
      version: number;
    }>
  >,
  videoRefs: PreviewStageVideoRefs
): void {
  useEffect(() => {
    setVideoFrameState((value) => {
      const canRender = resolveCanRenderState(activeVideoClipIds, videoRefs);
      if (value.canRender === canRender) {
        return value;
      }
      return {
        canRender,
        version: value.version,
      };
    });
  }, [activeVideoClipIds, currentTime, setVideoFrameState, videoRefs]);
}

function usePreviewStageVideoFrameListeners(
  activeVideoClipIds: string[],
  activeVideoClipKey: string,
  setVideoFrameState: Dispatch<
    SetStateAction<{
      canRender: boolean;
      version: number;
    }>
  >,
  videoRefs: PreviewStageVideoRefs
): void {
  useEffect(() => {
    const videos: HTMLVideoElement[] = [];
    for (const video of Object.values(videoRefs.current)) {
      if (video instanceof HTMLVideoElement) {
        videos.push(video);
      }
    }
    if (videos.length === 0) {
      return;
    }

    let frameHandle = 0;
    const requestFrameRefresh = () => {
      if (frameHandle !== 0) {
        cancelAnimationFrame(frameHandle);
      }
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        setVideoFrameState((value) => ({
          canRender: resolveCanRenderState(activeVideoClipIds, videoRefs),
          version: value.version + 1,
        }));
      });
    };

    addVideoFrameRefreshListeners(videos, requestFrameRefresh);

    return () => {
      if (frameHandle !== 0) {
        cancelAnimationFrame(frameHandle);
      }
      removeVideoFrameRefreshListeners(videos, requestFrameRefresh);
    };
  }, [activeVideoClipIds, activeVideoClipKey, setVideoFrameState, videoRefs]);
}

const VIDEO_FRAME_TRACKED_EVENTS = ['loadeddata', 'seeked', 'timeupdate'] as const;

function addVideoFrameRefreshListeners(videos: HTMLVideoElement[], listener: () => void) {
  for (const video of videos) {
    for (const eventName of VIDEO_FRAME_TRACKED_EVENTS) {
      video.addEventListener(eventName, listener);
    }
  }
}

function removeVideoFrameRefreshListeners(videos: HTMLVideoElement[], listener: () => void) {
  for (const video of videos) {
    for (const eventName of VIDEO_FRAME_TRACKED_EVENTS) {
      video.removeEventListener(eventName, listener);
    }
  }
}

export function usePreviewStageVideoFrameVersion(
  activeClips: VideoProjectClip[],
  currentTime: number,
  videoRefs: PreviewStageVideoRefs
): { canRender: boolean; version: number } {
  const activeVideoClipKey = resolveActiveVideoClipKey(activeClips);
  const activeVideoClipIds = parseActiveVideoClipIds(activeVideoClipKey);
  const [videoFrameState, setVideoFrameState] = useState({
    canRender: resolveCanRenderState(activeVideoClipIds, videoRefs),
    version: 0,
  });

  usePreviewStageVideoFrameStateSync(
    activeVideoClipIds,
    currentTime,
    setVideoFrameState,
    videoRefs
  );
  usePreviewStageVideoFrameListeners(
    activeVideoClipIds,
    activeVideoClipKey,
    setVideoFrameState,
    videoRefs
  );

  return videoFrameState;
}
