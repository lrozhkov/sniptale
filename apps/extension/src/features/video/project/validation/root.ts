import type { VideoProject, VideoProjectClip } from '../types/index';
import {
  VideoProjectClipType,
  VideoProjectSourceKind,
  VideoSceneBackgroundKind,
  VideoTimelinePlacementMode,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../types/index';
import { isVideoProjectAsset } from './assets';
import { isVideoProjectClip } from './clips';
import { isActionEvent, isCursorTrack, isMotionRegion } from './interaction';
import { isObjectTrack, isUtilityLanes } from './optional-branches';
import {
  MAX_VIDEO_PROJECT_DIMENSION,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
  MAX_VIDEO_PROJECT_FPS,
  isBoundedNumber,
  isBoundedArray,
  isColorString,
  isEnumValue,
  isFiniteNumber,
  isNonNegativeNumber,
  isNullable,
  isPositiveNumber,
  isRecord,
  isString,
} from './primitives';
import { isVideoProjectTrack } from './tracks';
import { hasValidEffectProjectReferences, isEffectProjectBranches } from './effect-instances';

function isProjectSource(value: unknown): boolean {
  if (!isRecord(value) || !isEnumValue(value['kind'], VideoProjectSourceKind)) {
    return false;
  }
  if (value['kind'] === VideoProjectSourceKind.RECORDING) {
    return isString(value['recordingId']);
  }
  if (value['kind'] === VideoProjectSourceKind.SCENARIO) {
    return isString(value['scenarioProjectId']);
  }
  return true;
}

function isSceneBackground(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((value['kind'] === VideoSceneBackgroundKind.SOLID && isColorString(value['color'])) ||
      (value['kind'] === VideoSceneBackgroundKind.GRADIENT &&
        isColorString(value['from']) &&
        isColorString(value['to']) &&
        isBoundedNumber(value['angle'], -3600, 3600)) ||
      (value['kind'] === VideoSceneBackgroundKind.IMAGE && isString(value['assetId'])))
  );
}

function isTransition(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['leadingClipId']) &&
    isString(value['trailingClipId']) &&
    isEnumValue(value['kind'], VideoTransitionKind) &&
    isBoundedNumber(value['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isEnumValue(value['easing'], VideoTransitionEasing)
  );
}

function isHydratableProjectShape(value: unknown): value is VideoProject {
  return (
    isRecord(value) &&
    value['version'] === 2 &&
    isString(value['id']) &&
    isString(value['name']) &&
    isProjectSource(value['source']) &&
    isNullable(value['baseRecordingId'], isString) &&
    isPositiveNumber(value['width']) &&
    value['width'] <= MAX_VIDEO_PROJECT_DIMENSION &&
    isPositiveNumber(value['height']) &&
    value['height'] <= MAX_VIDEO_PROJECT_DIMENSION &&
    isPositiveNumber(value['fps']) &&
    value['fps'] <= MAX_VIDEO_PROJECT_FPS &&
    isColorString(value['backgroundColor']) &&
    isEnumValue(value['timelinePlacementMode'], VideoTimelinePlacementMode) &&
    isNonNegativeNumber(value['duration']) &&
    value['duration'] <= MAX_VIDEO_PROJECT_DURATION_SECONDS &&
    isFiniteNumber(value['createdAt']) &&
    isFiniteNumber(value['updatedAt']) &&
    isBoundedArray(value['assets'], isVideoProjectAsset) &&
    isBoundedArray(value['tracks'], isVideoProjectTrack) &&
    isBoundedArray(value['clips'], isVideoProjectClip) &&
    isNullable(value['cursorTrack'], isCursorTrack) &&
    isBoundedArray(value['actionEvents'], isActionEvent) &&
    (value['sceneBackground'] === undefined || isSceneBackground(value['sceneBackground'])) &&
    (value['transitions'] === undefined || isBoundedArray(value['transitions'], isTransition)) &&
    !Object.hasOwn(value, 'templateInstances') &&
    isEffectProjectBranches(value['effectSnapshots'], value['effectInstances']) &&
    (value['objectTracks'] === undefined || isBoundedArray(value['objectTracks'], isObjectTrack)) &&
    (value['utilityLanes'] === undefined || isUtilityLanes(value['utilityLanes'])) &&
    (value['motionRegions'] === undefined || isBoundedArray(value['motionRegions'], isMotionRegion))
  );
}

export function hasValidVideoProjectBaseReferences(project: VideoProject): boolean {
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const trackIds = new Set(project.tracks.map((track) => track.id));
  const clipIds = new Set(project.clips.map((clip) => clip.id));
  const actionEventIds = new Set(project.actionEvents.map((event) => event.id));

  return (
    project.clips.every((clip) => hasValidClipReferences(clip, assetIds, trackIds)) &&
    hasValidSceneBackgroundReferences(project, assetIds) &&
    (project.transitions ?? []).every(
      (transition) =>
        clipIds.has(transition.leadingClipId) && clipIds.has(transition.trailingClipId)
    ) &&
    (project.motionRegions ?? []).every(
      (region) =>
        region.targetActionEventId === null || actionEventIds.has(region.targetActionEventId)
    )
  );
}

function hasValidReferences(project: VideoProject): boolean {
  return hasValidVideoProjectBaseReferences(project) && hasValidEffectProjectReferences(project);
}

function hasValidSceneBackgroundReferences(
  project: VideoProject,
  assetIds: ReadonlySet<string>
): boolean {
  return !(
    project.sceneBackground?.kind === VideoSceneBackgroundKind.IMAGE &&
    !assetIds.has(project.sceneBackground.assetId)
  );
}

function hasValidClipReferences(
  clip: VideoProjectClip,
  assetIds: ReadonlySet<string>,
  trackIds: ReadonlySet<string>
): boolean {
  if (!trackIds.has(clip.trackId)) {
    return false;
  }
  if ('assetId' in clip && !assetIds.has(clip.assetId)) {
    return false;
  }
  return !(
    clip.type === VideoProjectClipType.SHAPE &&
    clip.embeddedAsset &&
    !assetIds.has(clip.embeddedAsset.assetId)
  );
}

export function isHydratableVideoProject(value: unknown): value is VideoProject {
  return isHydratableProjectShape(value);
}

export function parseHydratableVideoProject(value: unknown): VideoProject | null {
  return isHydratableVideoProject(value) ? value : null;
}

export function isExportReadyVideoProject(value: unknown): value is VideoProject {
  return isHydratableVideoProject(value) && hasValidReferences(value);
}

export function assertExportReadyVideoProject(value: unknown): asserts value is VideoProject {
  if (!isExportReadyVideoProject(value)) {
    throw new Error('Invalid video project payload');
  }
}

export function isValidVideoProject(value: unknown): value is VideoProject {
  return isExportReadyVideoProject(value);
}
