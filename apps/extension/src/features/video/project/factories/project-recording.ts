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
import { VideoTimelinePlacementMode } from '../types/index';

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
    cursorTrack: params.cursorTrack,
    actionEvents: params.actionEvents,
  };
}

function createRecordingSceneBackgroundFields() {
  return syncProjectSceneBackground(
    { backgroundColor: DEFAULT_VIDEO_PROJECT_BACKGROUND },
    { kind: 'solid', color: DEFAULT_VIDEO_PROJECT_BACKGROUND }
  );
}
