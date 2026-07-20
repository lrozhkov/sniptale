import { isMimeTypeCompatibleWithFormat } from '../../persistence';
import {
  getAssetById,
  getTrackClips,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../../features/video/project/timeline/basics';
import {
  VideoExportFormat,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import {
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/model';
import type { Mp4VideoRenderSpan } from './types';
import { nearlyEqual } from './eligibility';

const ACCELERATED_SAMPLE_EPSILON_SECONDS = 1 / 240;
const PLAYBACK_RATE_EPSILON = 0.001;

function getSampleTimes(start: number, end: number): number[] {
  return end - start <= ACCELERATED_SAMPLE_EPSILON_SECONDS * 2
    ? [(start + end) / 2]
    : [
        start + ACCELERATED_SAMPLE_EPSILON_SECONDS,
        (start + end) / 2,
        end - ACCELERATED_SAMPLE_EPSILON_SECONDS,
      ];
}

function getVisibleVideoClipsAtTime(
  project: VideoProject,
  currentTime: number
): VideoProjectVideoClip[] {
  const result: VideoProjectVideoClip[] = [];
  for (const track of project.tracks) {
    if (!track.visible) {
      continue;
    }

    for (const clip of getTrackClips(project, track.id)) {
      if (isVideoClip(clip) && isClipActiveAtTime(clip, currentTime)) {
        result.push(clip);
      }
    }
  }
  return result;
}

function canUseWebmFrameProvider(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  clip: VideoProjectVideoClip
): boolean {
  const asset = getAssetById(project, clip.assetId);
  return Boolean(
    asset &&
    settings.format === VideoExportFormat.MP4 &&
    isMimeTypeCompatibleWithFormat(asset.metadata.mimeType, VideoExportFormat.WEBM) &&
    nearlyEqual(clip.playbackRate ?? 1, 1, PLAYBACK_RATE_EPSILON)
  );
}

export function createAcceleratedCompositeSpan(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  start: number,
  end: number
): Mp4VideoRenderSpan | null {
  let hasVideoClip = false;
  for (const time of getSampleTimes(start, end)) {
    const clips = getVisibleVideoClipsAtTime(project, time);
    hasVideoClip ||= clips.length > 0;
    if (!clips.every((clip) => canUseWebmFrameProvider(project, settings, clip))) {
      return null;
    }
  }

  return hasVideoClip
    ? { end, kind: 'accelerated-composite', reason: 'webm-frame-provider', start }
    : null;
}
