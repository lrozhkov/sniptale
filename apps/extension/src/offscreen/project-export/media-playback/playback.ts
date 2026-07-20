import {
  clampClipPlaybackRate,
  getClipCompositeAudioGain,
  getMediaClipSourceTime,
  isClipActiveAtTime,
} from '../../../features/video/project/timeline';
import { shouldRefreshMediaTime } from '../../../features/video/project/playback-sync';
import { isAudioClip, isVideoClip } from '../../../features/video/project/timeline/basics';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { shouldRenderClipAudio } from '../media/audio';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

function syncClipAudioGain(args: {
  audioNode: { gain: GainNode } | undefined;
  clip: VideoProjectAudioClip | VideoProjectVideoClip;
  currentTime: number;
  isActive: boolean;
  project: VideoProject;
}): void {
  if (!args.audioNode) {
    return;
  }

  args.audioNode.gain.gain.value =
    args.isActive && shouldRenderClipAudio(args.project, args.clip)
      ? getClipCompositeAudioGain(args.project, args.clip, args.currentTime)
      : 0;
}

function syncActiveClipElement(args: {
  currentTime: number;
  element: HTMLMediaElement;
  playbackRate: number;
  project: VideoProject;
  clip: VideoProjectAudioClip | VideoProjectVideoClip;
}): void {
  const desiredTime = getMediaClipSourceTime(args.clip, args.currentTime);
  args.element.playbackRate = args.playbackRate;
  if (
    shouldRefreshMediaTime({
      currentTime: args.element.currentTime,
      isPlaying: true,
      nextTime: desiredTime,
      playbackRate: args.playbackRate,
    })
  ) {
    args.element.currentTime = desiredTime;
  }

  if (args.element.paused) {
    void args.element.play().catch((error) => {
      logger.warn('Media playback sync failed', error);
    });
  }
}

export function syncClipPlayback(
  job: Pick<
    {
      clipMediaElements: Map<string, HTMLMediaElement>;
      clipAudioNodes: Map<string, { gain: GainNode }>;
    },
    'clipMediaElements' | 'clipAudioNodes'
  >,
  project: VideoProject,
  currentTime: number
): void {
  for (const clip of project.clips) {
    if (!isVideoClip(clip) && !isAudioClip(clip)) {
      continue;
    }

    const element = job.clipMediaElements.get(clip.id);
    if (!element) {
      continue;
    }

    const audioNode = job.clipAudioNodes.get(clip.id);
    const isActive = isClipActiveAtTime(clip, currentTime);
    syncClipAudioGain({ audioNode, clip, currentTime, isActive, project });

    if (!isActive) {
      if (!element.paused) {
        element.pause();
      }
      continue;
    }

    const playbackRate = clampClipPlaybackRate(clip.playbackRate ?? 1);
    syncActiveClipElement({ clip, currentTime, element, playbackRate, project });
  }
}
