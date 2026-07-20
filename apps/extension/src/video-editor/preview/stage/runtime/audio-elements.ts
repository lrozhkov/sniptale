import { createLogger } from '@sniptale/platform/observability/logger';

import {
  getClipCompositeAudioGain,
  getMediaClipSourceTime,
  isClipActiveAtTime,
} from '../../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../../features/video/project/timeline/rate';
import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import { type PreviewMediaSyncState, shouldRefreshPreviewMediaTime } from '../media/sync';
import type { PreviewStageAudioSyncParams } from '../types';
import { isAudioDrivenPreviewClip } from './audio-clips';
import {
  cleanupPreviewAudioGraph,
  ensurePreviewAudioGraphNode,
  setPreviewAudioClipGain,
  setPreviewAudioNodeGain,
  type PreviewAudioGraphState,
} from './playback/audio-graph';
import {
  pausePreviewAudioDriver,
  requestPreviewAudioDriverPlayback,
} from './playback/audio-driver';
import { applyPreviewPitchPreservation } from './playback/pitch';

const logger = createLogger({ namespace: 'VideoEditorPreviewAudio' });

function clampPreviewAudioVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function preparePreviewAudioElement(audio: HTMLAudioElement, playbackRate: number): void {
  applyPreviewPitchPreservation(audio);
  audio.defaultMuted = false;
  audio.muted = false;
  audio.volume = 1;
  audio.playbackRate = playbackRate;
}

function stopPreviewAudioClip(
  graphState: PreviewAudioGraphState,
  clipId: string,
  audio: HTMLAudioElement
): void {
  audio.muted = false;
  audio.volume = 1;
  setPreviewAudioClipGain(graphState, clipId, 0);
  pausePreviewAudioDriver(graphState, clipId, audio);
}

function syncPreviewAudioClip(params: PreviewStageAudioClipSyncParams): void {
  const { audio, audioGraphState, clip, currentTime, isPlaying, mediaSyncState, project } = params;
  const nextTime = getMediaClipSourceTime(clip, currentTime);
  const playbackRate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const isClipActive = isClipActiveAtTime(clip, currentTime);
  preparePreviewAudioElement(audio, playbackRate);

  if (
    shouldRefreshPreviewMediaTime({
      currentTime,
      isPlaying,
      mediaCurrentTime: audio.currentTime,
      mediaPaused: audio.paused,
      nextTime,
      playbackRate,
      state: mediaSyncState,
    })
  ) {
    audio.currentTime = nextTime;
  }

  const node = ensurePreviewAudioGraphNode(audioGraphState, clip.id, audio, logger);
  if (!node) {
    pausePreviewAudioDriver(audioGraphState, clip.id, audio);
    return;
  }

  const gain = isClipActive
    ? clampPreviewAudioVolume(getClipCompositeAudioGain(project, clip, currentTime))
    : 0;
  setPreviewAudioNodeGain(node, gain);

  if (isPlaying && isClipActive && gain > 0) {
    requestPreviewAudioDriverPlayback(audioGraphState, clip.id, audio, logger);
    return;
  }

  pausePreviewAudioDriver(audioGraphState, clip.id, audio);
}

export function syncPreviewAudioElements(params: PreviewStageAudioElementSyncParams): void {
  const { audioGraphState, audioRefs, project, syncedClips } = params;
  const activeClipById = new Map(syncedClips.map((clip) => [clip.id, clip]));
  const syncedAudioClips = syncedClips.filter((clip) =>
    isAudioDrivenPreviewClip(project, clip, activeClipById)
  );
  const syncedIds = new Set(syncedAudioClips.map((clip) => clip.id));

  Object.entries(audioRefs.current).forEach(([clipId, audio]) => {
    if (!audio || syncedIds.has(clipId)) {
      return;
    }

    stopPreviewAudioClip(audioGraphState, clipId, audio);
  });

  for (const clip of syncedAudioClips) {
    const audio = audioRefs.current[clip.id];
    if (!audio) {
      continue;
    }

    syncPreviewAudioClip({ ...params, audio, clip });
  }
}

export function cleanupPreviewAudio(params: {
  audioGraphState: PreviewAudioGraphState;
  audioRefs: PreviewStageAudioSyncParams['audioRefs'];
}): void {
  Object.values(params.audioRefs.current).forEach((audio) => {
    audio?.pause();
    if (audio) {
      audio.muted = false;
      audio.volume = 1;
    }
  });
  cleanupPreviewAudioGraph(params.audioGraphState, logger);
}

export interface PreviewStageAudioElementSyncParams extends PreviewStageAudioSyncParams {
  audioGraphState: PreviewAudioGraphState;
  mediaSyncState: PreviewMediaSyncState;
}

interface PreviewStageAudioClipSyncParams extends PreviewStageAudioElementSyncParams {
  audio: HTMLAudioElement;
  clip: VideoProjectAudioClip | VideoProjectVideoClip;
}
