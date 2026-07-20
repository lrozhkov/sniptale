import { useRef, type MutableRefObject } from 'react';

import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import {
  useActivePreviewAudioClips,
  usePreviewStageAudioBankClips,
  usePreviewStageAudioSync,
} from '../runtime/audio';
import { usePreviewEffectAudio } from '../runtime/effect-audio';
import { usePreviewStagePlaybackPreviewRuntime } from '../runtime/playback/prepare';
import { usePreviewStageVideoBankClips, usePreviewStageVideoSync } from '../runtime/index';
import type { PlaybackPreviewRuntime } from '../../../interaction/playback/types';
import type { PreviewEffectRuntimeFeedback } from '../types';
import type { VideoEditorPreviewMode } from '../../../contracts/preview-runtime';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';
import type { VideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';

interface PreviewStageMediaRuntimeParams {
  activeClips: VideoProjectClip[];
  assetUrls: Record<string, string>;
  currentTime: number;
  effectRuntimeFeedback: PreviewEffectRuntimeFeedback;
  isPlaying: boolean;
  onPresentationTime: (time: number) => void;
  playbackRange: VideoEditorPlaybackRange | null;
  previewExactFrameCache: VideoPreviewExactFrameCache;
  previewMode: VideoEditorPreviewMode;
  previewRasterSize: VideoEditorPreviewRasterSize;
  project: VideoProject;
  renderGenerationRef: MutableRefObject<number>;
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
}

export function usePreviewStageMediaRuntime(params: PreviewStageMediaRuntimeParams) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const videoBankClips = usePreviewStageVideoBankClips(
    params.project,
    params.currentTime,
    params.activeClips
  );
  const activeAudioClips = useActivePreviewAudioClips(params.project, params.currentTime);
  const audioBankClips = usePreviewStageAudioBankClips(
    params.project,
    params.currentTime,
    activeAudioClips
  );
  const previewRuntime = usePreviewStagePlaybackPreviewRuntime({
    assetUrls: params.assetUrls,
    audioBankClips,
    audioRefs,
    previewExactFrameCache: params.previewExactFrameCache,
    previewMode: params.previewMode,
    playbackRange: params.playbackRange,
    onPresentationTime: params.onPresentationTime,
    previewRasterSize: params.previewRasterSize,
    project: params.project,
    renderGenerationRef: params.renderGenerationRef,
    registerPreviewRuntime: params.registerPreviewRuntime,
    videoBankClips,
    videoRefs,
  });
  usePreviewMediaSynchronization(params, { audioBankClips, audioRefs, videoBankClips, videoRefs });
  return { audioBankClips, audioRefs, ...previewRuntime, videoBankClips, videoRefs };
}

function usePreviewMediaSynchronization(
  params: PreviewStageMediaRuntimeParams,
  media: {
    audioBankClips: ReturnType<typeof usePreviewStageAudioBankClips>;
    audioRefs: MutableRefObject<Record<string, HTMLAudioElement | null>>;
    videoBankClips: ReturnType<typeof usePreviewStageVideoBankClips>;
    videoRefs: MutableRefObject<Record<string, HTMLVideoElement | null>>;
  }
): void {
  usePreviewStageVideoSync({
    activeClips: params.activeClips,
    currentTime: params.currentTime,
    isPlaying: params.isPlaying,
    syncedClips: media.videoBankClips,
    videoRefs: media.videoRefs,
  });
  usePreviewStageAudioSync({
    audioRefs: media.audioRefs,
    currentTime: params.currentTime,
    isPlaying: params.isPlaying,
    project: params.project,
    syncedClips: media.audioBankClips,
  });
  usePreviewEffectAudio({
    currentTime: params.currentTime,
    feedback: params.effectRuntimeFeedback,
    isPlaying: params.isPlaying,
    project: params.project,
  });
}
