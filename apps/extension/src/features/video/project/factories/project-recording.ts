import { createVideoProjectSource, DEFAULT_VIDEO_PROJECT_BACKGROUND } from '../defaults';
import { getVideoProjectMutationTimestamp } from '../mutation';
import { createDefaultVideoProjectUtilityLanes } from '../utility-lanes';
import { syncProjectSceneBackground } from '../scene/background';
import type {
  VideoProject,
  VideoProjectActionEvent,
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
  actionEvents: VideoProjectActionEvent[];
  clips: VideoProjectClip[];
  cursorTrack: VideoProjectCursorTrack | null;
  recordingId: string;
}) {
  const sourceClip = params.clips.find((clip) => clip.type === VideoProjectClipType.VIDEO);
  if (!sourceClip) {
    return { actionEvents: params.actionEvents, cursorTrack: params.cursorTrack };
  }

  return {
    actionEvents: params.actionEvents.map((event) =>
      event.timeBasis === VideoProjectInteractionTimeBasis.PROJECT
        ? event
        : {
            ...event,
            sourceAnchor:
              event.sourceAnchor ??
              createRecordingSourceAnchor(params.recordingId, sourceClip.id, event.time),
          }
    ),
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
  actionEvents: VideoProjectActionEvent[];
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
    actionEvents: params.actionEvents,
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
