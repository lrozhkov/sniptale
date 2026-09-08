import { createVideoProjectSource, DEFAULT_VIDEO_PROJECT_BACKGROUND } from '../defaults';
import { getVideoProjectMutationTimestamp } from '../mutation';
import { createDefaultVideoProjectUtilityLanes } from '../utility-lanes';
import { syncProjectSceneBackground } from '../scene/background';
import type {
  VideoProject,
  VideoProjectActionEvent,
  SourceNormalizedRecordingActionEvent,
  VideoProjectAsset,
  VideoProjectClip,
  VideoProjectCursorTrack,
  VideoProjectTrack,
} from '../types/index';
import { VideoProjectInteractionTimeBasis, VideoTimelinePlacementMode } from '../types/index';
import { VideoProjectClipType } from '../types/index';

function createRecordingSourceAnchor(
  recordingId: string,
  sourceClipId: string,
  sourceTime: number
) {
  return {
    kind: 'recording-source' as const,
    recordingId,
    sourceClipId,
    sourceTime,
  };
}

function anchorRecordingInteractions(params: {
  sourceNormalizedActionEvents: SourceNormalizedRecordingActionEvent[];
  clips: VideoProjectClip[];
  cursorTrack: VideoProjectCursorTrack | null;
  recordingId: string;
}) {
  const sourceClip = params.clips.find((clip) => clip.type === VideoProjectClipType.VIDEO);
  if (!sourceClip || !sourceClip.sourceInstanceId) {
    return { actionEvents: [], cursorTrack: params.cursorTrack };
  }

  return {
    actionEvents: params.sourceNormalizedActionEvents.map<VideoProjectActionEvent>((event) => ({
      id: crypto.randomUUID(),
      kind: event.kind,
      label: event.label,
      data: { ...event.data },
      point:
        event.point &&
        Number.isFinite(event.point.x) &&
        Number.isFinite(event.point.y) &&
        event.point.x >= 0 &&
        event.point.x <= 1 &&
        event.point.y >= 0 &&
        event.point.y <= 1
          ? { ...event.point }
          : null,
      capturedDuration: event.duration,
      ...(event.kind !== 'CLICK' && event.kind !== 'KEY'
        ? { presentation: { preset: event.preset } }
        : {}),
      anchor: {
        kind: 'recording-source',
        recordingId: params.recordingId,
        sourceInstanceId: sourceClip.sourceInstanceId!,
        sourceEventId: event.id,
        sourceTime: event.time,
      },
    })),
    cursorTrack: params.cursorTrack
      ? {
          ...params.cursorTrack,
          samples: params.cursorTrack.samples.map((sample) =>
            sample.timeBasis === VideoProjectInteractionTimeBasis.PROJECT
              ? sample
              : {
                  ...sample,
                  sourceAnchor:
                    sample.sourceAnchor ??
                    createRecordingSourceAnchor(params.recordingId, sourceClip.id, sample.time),
                }
          ),
        }
      : null,
  };
}

export function createRecordingProjectDocument(params: {
  sourceNormalizedActionEvents: SourceNormalizedRecordingActionEvent[];
  asset: VideoProjectAsset;
  clips: VideoProjectClip[];
  cursorTrack: VideoProjectCursorTrack | null;
  motionRegions: VideoProject['motionRegions'];
  options: {
    filename: string;
    height: number;
    recordingId: string;
    width: number;
  };
  sidecarAssets: VideoProjectAsset[];
  tracks: VideoProjectTrack[];
}): VideoProject {
  const now = getVideoProjectMutationTimestamp();
  const interactions = anchorRecordingInteractions({
    sourceNormalizedActionEvents: params.sourceNormalizedActionEvents,
    clips: params.clips,
    cursorTrack: params.cursorTrack,
    recordingId: params.options.recordingId,
  });
  return {
    version: 2,
    id: crypto.randomUUID(),
    name: params.options.filename.replace(/\.[^.]+$/i, ''),
    source: createVideoProjectSource(params.options.recordingId),
    baseRecordingId: params.options.recordingId,
    width: params.options.width,
    height: params.options.height,
    fps: 30,
    ...createRecordingSceneBackgroundFields(),
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    duration: Math.max(0.1, ...params.clips.map((clip) => clip.duration)),
    createdAt: now,
    updatedAt: now,
    assets: [params.asset, ...params.sidecarAssets],
    tracks: params.tracks,
    clips: params.clips,
    transitions: [],
    utilityLanes: createDefaultVideoProjectUtilityLanes(),
    ...(params.motionRegions === undefined ? {} : { motionRegions: params.motionRegions }),
    cursorTrack: interactions.cursorTrack,
    actionEvents: interactions.actionEvents,
  };
}

function createRecordingSceneBackgroundFields() {
  return syncProjectSceneBackground(
    { backgroundColor: DEFAULT_VIDEO_PROJECT_BACKGROUND },
    { kind: 'solid', color: DEFAULT_VIDEO_PROJECT_BACKGROUND }
  );
}
