import type { VideoProject } from '../../../features/video/project/types';
import { createVideoPreviewSegmentRevision } from './revision';

const VIDEO_PREVIEW_CACHE_SEGMENT_SECONDS = 2;

export interface VideoPreviewCacheSegmentPlanEntry {
  endFrame: number;
  fingerprint: string;
  index: number;
  startFrame: number;
}

export async function createVideoPreviewCacheSegmentPlan(
  project: VideoProject,
  range: { endFrame: number; startFrame: number }
): Promise<VideoPreviewCacheSegmentPlanEntry[]> {
  const framesPerSegment = Math.max(
    1,
    Math.round(VIDEO_PREVIEW_CACHE_SEGMENT_SECONDS * Math.max(1, project.fps))
  );
  const segments: Array<Omit<VideoPreviewCacheSegmentPlanEntry, 'fingerprint'>> = [];
  for (
    let startFrame = range.startFrame;
    startFrame < range.endFrame;
    startFrame += framesPerSegment
  ) {
    segments.push({
      endFrame: Math.min(range.endFrame, startFrame + framesPerSegment),
      index: segments.length,
      startFrame,
    });
  }
  return Promise.all(
    segments.map(async (segment) => ({
      ...segment,
      fingerprint: await createVideoPreviewSegmentRevision(project, segment),
    }))
  );
}
