import type { VideoProjectUtilityLanes } from './types/index';

export type VideoProjectUtilityLaneKind = keyof VideoProjectUtilityLanes;
type VideoProjectUtilityLaneSource = {
  utilityLanes?: Partial<
    Record<
      VideoProjectUtilityLaneKind,
      Partial<VideoProjectUtilityLanes[VideoProjectUtilityLaneKind]>
    >
  >;
};

const DEFAULT_VIDEO_PROJECT_UTILITY_LANES = {
  actions: { visible: true, locked: false },
  camera: { visible: true, locked: false },
} satisfies VideoProjectUtilityLanes;

export function createDefaultVideoProjectUtilityLanes(): VideoProjectUtilityLanes {
  return {
    actions: { ...DEFAULT_VIDEO_PROJECT_UTILITY_LANES.actions },
    camera: { ...DEFAULT_VIDEO_PROJECT_UTILITY_LANES.camera },
  };
}

export function getVideoProjectUtilityLanes(
  project: VideoProjectUtilityLaneSource
): VideoProjectUtilityLanes {
  return {
    actions: {
      ...DEFAULT_VIDEO_PROJECT_UTILITY_LANES.actions,
      ...project.utilityLanes?.actions,
    },
    camera: {
      ...DEFAULT_VIDEO_PROJECT_UTILITY_LANES.camera,
      ...project.utilityLanes?.camera,
    },
  };
}

export function isVideoProjectUtilityLaneVisible(
  project: VideoProjectUtilityLaneSource,
  lane: VideoProjectUtilityLaneKind
): boolean {
  return getVideoProjectUtilityLanes(project)[lane].visible;
}

export function isVideoProjectUtilityLaneLocked(
  project: VideoProjectUtilityLaneSource,
  lane: VideoProjectUtilityLaneKind
): boolean {
  return getVideoProjectUtilityLanes(project)[lane].locked;
}
