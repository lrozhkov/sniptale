import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import type {
  TimelineVideoFrameLoadResult,
  TimelineVideoFrameLoadPlan,
} from './timeline-frame-loader';
import { buildTimelinePreviewPlans } from './timeline-preview-plans';

export async function resolveLoadedFrames(
  plan: TimelineVideoFrameLoadPlan
): Promise<readonly TimelineVideoFrameLoadResult[]> {
  return plan.samples.map((sample) => ({
    cacheKey: sample.cacheKey,
    sourceTime: sample.sourceTime,
    url: `blob:frame-${sample.sourceTime}`,
  }));
}

export function createLoadedFrame(
  plan: TimelineVideoFrameLoadPlan,
  index: number,
  url: string
): TimelineVideoFrameLoadResult {
  const sample = plan.samples[index]!;
  return { cacheKey: sample.cacheKey, sourceTime: sample.sourceTime, url };
}

export function getLoadedSourceTimes(loader: {
  mock: { calls: Array<[TimelineVideoFrameLoadPlan]> };
}) {
  return loader.mock.calls.flatMap((call) => call[0].samples.map((sample) => sample.sourceTime));
}

export function getPlannedVideoSlotCount(project: VideoProject): number {
  return (
    buildTimelinePreviewPlans(project, { 'asset-video': 'blob:video' }, null)[0]?.slotKeys.length ??
    0
  );
}

export function createProjectWithVisualClip(
  type: VideoProjectAssetType,
  options: { duration?: number } = {}
): VideoProject {
  const project = createEmptyVideoProject('Timeline previews');
  const assetId = type === VideoProjectAssetType.IMAGE ? 'asset-image' : 'asset-video';
  const assetDuration = options.duration ?? 10;
  const asset = createVideoProjectAsset(`Asset ${assetId}`, type, createAssetSource(assetId), {
    audioPeaks: null,
    duration: assetDuration,
    hasAudio: type === VideoProjectAssetType.VIDEO,
    height: 720,
    mimeType: type === VideoProjectAssetType.IMAGE ? 'image/png' : 'video/webm',
    size: 1024,
    width: 1280,
  });
  asset.id = assetId;

  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0);
  clip.id = 'clip-1';
  clip.duration = assetDuration === 300 ? 300 : 4;
  if (clip.type === VideoProjectClipType.VIDEO) {
    configureVideoClipSource(clip, assetDuration);
  }

  return {
    ...project,
    assets: [asset],
    clips: [clip],
  };
}

export function createMovedSplitDuplicateProject(project: VideoProject): VideoProject {
  const clip = project.clips[0] as VideoProjectVideoClip;
  return {
    ...project,
    clips: [
      { ...clip, duration: 1, id: 'clip-1-a', startTime: 10, sourceDuration: 1 },
      { ...clip, duration: 3, id: 'clip-1-b', startTime: 11, sourceDuration: 3, sourceStart: 3 },
      { ...clip, id: 'clip-1-copy', startTime: 20 },
    ],
  };
}

export function createTrimmedProject(
  project: VideoProject,
  patch: Pick<VideoProjectVideoClip, 'sourceDuration'>
): VideoProject {
  const clip = project.clips[0] as VideoProjectVideoClip;
  return { ...project, clips: [{ ...clip, duration: patch.sourceDuration, ...patch }] };
}

function configureVideoClipSource(clip: VideoProjectVideoClip, assetDuration: number) {
  clip.sourceStart = assetDuration === 300 ? 0 : 2;
  clip.sourceDuration = assetDuration === 300 ? 300 : 4;
}

function createAssetSource(assetId: string) {
  return {
    kind: 'project-asset' as const,
    projectAssetId: `project-${assetId}`,
  };
}
