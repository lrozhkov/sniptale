import { hasValidVideoProjectCursorSourceObservations } from '../cursor-source-observations';
import {
  parseVideoProjectSourceVoiceoverDocuments,
  hasValidVideoProjectSourceVoiceoverReferences,
} from '../source-voiceover';
import {
  parseVideoProjectSourceAudioDocuments,
  hasValidVideoProjectSourceAudioReferences,
} from '../source-audio';
import {
  parseVideoProjectCompositionJoins,
  hasValidVideoProjectCompositionJoinReferences,
} from '../scene/joins';
import {
  parseVideoProjectBookendPresets,
  hasValidVideoProjectBookendReferences,
} from '../scene/bookend-presets';
import { parseVideoProjectSceneEdges } from '../scene/edge-fades';
import {
  parseVideoProjectCommentDocuments,
  hasValidVideoProjectCommentReferences,
} from '../comments/validation';
import { getVideoProjectWatermarkAsset, parseQuickEditWatermark } from '../scene/watermark';
import { parseSceneBackgroundSettings } from '../scene/background-settings';
import {
  parseVideoProjectTextDocuments,
  hasValidVideoProjectTextReferences,
} from '../text/validation';
import { parseVideoProjectActionFeedback } from '../action-feedback/validation';
import { parseCursorFocusPath } from '../cursor-focus-path/validation';
import { parseCameraFollowSettings } from '../camera/cursor-policy';
import { resolveVideoProjectActionOccurrences } from '../action-occurrences';
import type { VideoProject, VideoProjectClip, VideoProjectSourceTimeAnchor } from '../types/index';
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
import {
  isActionEvent,
  isVideoProjectActionPresentation,
  isCursorTrack,
  isMotionRegion,
} from './interaction';
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

/** Minimum schema for present clip fields, independent of later shape admission. */
function minimumClipSchemaVersion(value: unknown): number {
  if (!isRecord(value)) return 2;
  if (value['rememberedWindowLayout'] !== undefined) return 36;
  if (value['rememberedWindowHeader'] !== undefined || value['rememberedSourceCrop'] !== undefined)
    return 35;
  if (value['cameraTiming'] !== undefined) return 32;
  if (value['durationMode'] !== undefined) return 30;
  if (
    (value['type'] === 'VIDEO' || value['type'] === 'AUDIO') &&
    typeof value['playbackRate'] === 'number' &&
    value['playbackRate'] < 0.1
  )
    return 27;
  if (value['windowCornerRadius'] !== undefined) return 15;
  if (value['sourceCrop'] !== undefined) return 13;
  if (value['cameraHiddenRanges'] !== undefined) return 12;
  if (
    Array.isArray(value['cameraPositions']) &&
    value['cameraPositions'].some(
      (position: unknown) => isRecord(position) && position['crop'] !== undefined
    )
  )
    return 11;
  if (isRecord(value['cameraAppearance']) && value['cameraAppearance']['shape'] === 'circle')
    return 10;
  if (value['shadowColor'] !== undefined) return 9;
  if (value['cameraMirrored'] !== undefined) return 8;
  if (value['originalAudioMute'] !== undefined) return 6;
  return 2;
}

/** Refuse fields that the declared reader version does not support. */
function isProjectSchemaCompatible(value: Record<string, unknown>): boolean {
  const version = value['version'];
  return (
    isBoundedNumber(version, 2, 37) &&
    Number.isInteger(version) &&
    (version >= 37 ||
      !isRecord(value['sceneBackground']) ||
      value['sceneBackground']['zoomBehavior'] === undefined) &&
    (version >= 36 ||
      (value['watermarkEnabled'] === undefined &&
        (!isRecord(value['sceneBackground']) ||
          (value['sceneBackground']['enabled'] === undefined &&
            value['sceneBackground']['rememberedBlur'] === undefined)))) &&
    (version >= 35 || value['rememberedCanvas'] === undefined) &&
    (version >= 34 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) =>
          !isRecord(region) ||
          ((!isRecord(region['focusArea']) || region['focusArea']['axes'] === undefined) &&
            (!isRecord(region['sourceBinding']) ||
              (region['sourceBinding']['unresolvedLinkTo'] === undefined &&
                region['sourceBinding']['dormant'] === undefined &&
                region['sourceBinding']['phaseProjection'] === undefined &&
                region['sourceBinding']['coordinateSpace'] === undefined)) &&
            (!isRecord(region['phaseTransitions']) ||
              region['phaseTransitions']['link'] === undefined))
      )) &&
    (version >= 33 ||
      !isRecord(value['cursorTrack']) ||
      value['cursorTrack']['sourceObservations'] === undefined) &&
    (version >= 31 ||
      (value['sourceVoiceoverDocuments'] === undefined &&
        (!Array.isArray(value['sourceAudioDocuments']) ||
          value['sourceAudioDocuments'].every(
            (entry: unknown) => !isRecord(entry) || entry['speech'] === undefined
          )))) &&
    (version >= 29 ||
      !Array.isArray(value['textDocuments']) ||
      value['textDocuments'].every(
        (entry: unknown) => !isRecord(entry) || entry['durationMode'] === undefined
      )) &&
    (version >= 28 || value['sourceAudioDocuments'] === undefined) &&
    (version >= 26 ||
      (value['compositionJoins'] === undefined &&
        (!isRecord(value['bookendPresets']) ||
          (value['bookendPresets']['introTransition'] === undefined &&
            value['bookendPresets']['outroTransition'] === undefined)))) &&
    (version >= 25 || value['bookendPresets'] === undefined) &&
    (version >= 24 || value['sceneEdges'] === undefined) &&
    (version >= 23 || value['commentDocuments'] === undefined) &&
    (version >= 20 || value['watermark'] === undefined) &&
    (version >= 22 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) =>
          !isRecord(region) ||
          (region['spotlight'] === undefined && region['spotlightTarget'] === undefined)
      )) &&
    (version >= 21 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) =>
          !isRecord(region) ||
          (region['border'] === undefined && region['borderTarget'] === undefined)
      )) &&
    (version >= 3 ||
      (value['cursorFocusPath'] === undefined && value['actionFeedback'] === undefined)) &&
    (version >= 4 ||
      (value['cameraFollowDefaults'] === undefined &&
        (!Array.isArray(value['motionRegions']) ||
          value['motionRegions'].every(
            (region: unknown) => !isRecord(region) || region['cameraFollow'] === undefined
          )))) &&
    (version >= 19 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) =>
          !isRecord(region) ||
          (region['perspective'] === undefined &&
            region['depthOfField'] === undefined &&
            region['spatialReference'] === undefined)
      )) &&
    (version >= 18 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) => !isRecord(region) || region['phaseTransitions'] === undefined
      )) &&
    (version >= 17 ||
      !Array.isArray(value['motionRegions']) ||
      value['motionRegions'].every(
        (region: unknown) => !isRecord(region) || region['motionBlur'] === undefined
      )) &&
    (version >= 16 ||
      !isRecord(value['sceneBackground']) ||
      value['sceneBackground']['blur'] === undefined) &&
    (version >= 14 ||
      !isRecord(value['sceneBackground']) ||
      (value['sceneBackground']['remembered'] === undefined &&
        value['sceneBackground']['imageFit'] === undefined)) &&
    (version >= 5 || value['textDocuments'] === undefined) &&
    (version >= 7 ||
      !Array.isArray(value['tracks']) ||
      value['tracks'].every(
        (track: unknown) => !isRecord(track) || track['audioVolume'] === undefined
      )) &&
    (!Array.isArray(value['clips']) ||
      value['clips'].every((clip: unknown) => version >= minimumClipSchemaVersion(clip)))
  );
}

function isHydratableProjectShape(value: unknown): value is VideoProject {
  return (
    isRecord(value) &&
    isProjectSchemaCompatible(value) &&
    (value['cameraFollowDefaults'] === undefined ||
      parseCameraFollowSettings(value['cameraFollowDefaults']) !== null) &&
    isString(value['id']) &&
    (value['textDocuments'] === undefined ||
      parseVideoProjectTextDocuments(value['textDocuments']) !== null) &&
    (value['commentDocuments'] === undefined ||
      parseVideoProjectCommentDocuments(value['commentDocuments']) !== null) &&
    (value['sourceAudioDocuments'] === undefined ||
      parseVideoProjectSourceAudioDocuments(value['sourceAudioDocuments']) !== null) &&
    (value['sourceVoiceoverDocuments'] === undefined ||
      parseVideoProjectSourceVoiceoverDocuments(value['sourceVoiceoverDocuments']) !== null) &&
    isString(value['name']) &&
    isProjectSource(value['source']) &&
    isNullable(value['baseRecordingId'], isString) &&
    isPositiveNumber(value['width']) &&
    value['width'] <= MAX_VIDEO_PROJECT_DIMENSION &&
    isPositiveNumber(value['height']) &&
    value['height'] <= MAX_VIDEO_PROJECT_DIMENSION &&
    (value['rememberedCanvas'] === undefined ||
      (isRecord(value['rememberedCanvas']) &&
        isPositiveNumber(value['rememberedCanvas']['width']) &&
        value['rememberedCanvas']['width'] <= MAX_VIDEO_PROJECT_DIMENSION &&
        isPositiveNumber(value['rememberedCanvas']['height']) &&
        value['rememberedCanvas']['height'] <= MAX_VIDEO_PROJECT_DIMENSION)) &&
    isPositiveNumber(value['fps']) &&
    value['fps'] <= MAX_VIDEO_PROJECT_FPS &&
    (value['videoEffectsBypassed'] === undefined ||
      typeof value['videoEffectsBypassed'] === 'boolean') &&
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
    parseVideoProjectActionFeedback(value['actionFeedback']) !== null &&
    (value['cursorFocusPath'] === undefined ||
      parseCursorFocusPath(value['cursorFocusPath']) !== null) &&
    isBoundedArray(value['actionEvents'], isActionEvent) &&
    (value['actionPresentation'] === undefined ||
      isVideoProjectActionPresentation(value['actionPresentation'])) &&
    (value['watermarkEnabled'] === undefined || value['watermarkEnabled'] === false) &&
    (value['watermark'] === undefined || parseQuickEditWatermark(value['watermark']) !== null) &&
    (value['bookendPresets'] === undefined ||
      parseVideoProjectBookendPresets(value['bookendPresets']) !== null) &&
    (value['compositionJoins'] === undefined ||
      parseVideoProjectCompositionJoins(value['compositionJoins']) !== null) &&
    (value['sceneEdges'] === undefined ||
      parseVideoProjectSceneEdges(value['sceneEdges']) !== null) &&
    (value['sceneBackground'] === undefined ||
      parseSceneBackgroundSettings(value['sceneBackground']) !== null) &&
    (value['transitions'] === undefined || isBoundedArray(value['transitions'], isTransition)) &&
    !Object.hasOwn(value, 'templateInstances') &&
    isEffectProjectBranches(value['effectSnapshots'], value['effectInstances']) &&
    (value['objectTracks'] === undefined || isBoundedArray(value['objectTracks'], isObjectTrack)) &&
    (value['utilityLanes'] === undefined || isUtilityLanes(value['utilityLanes'])) &&
    (value['motionRegions'] === undefined || isBoundedArray(value['motionRegions'], isMotionRegion))
  );
}

function hasValidVideoProjectBaseReferences(project: VideoProject): boolean {
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const trackIds = new Set(project.tracks.map((track) => track.id));
  const clipIds = new Set(project.clips.map((clip) => clip.id));
  const occurrences = resolveVideoProjectActionOccurrences(project);

  return (
    project.clips.every((clip) => hasValidClipReferences(clip, assetIds, trackIds)) &&
    hasValidSceneBackgroundReferences(project, assetIds) &&
    (!project.watermark?.image || getVideoProjectWatermarkAsset(project) !== undefined) &&
    hasValidVideoProjectBookendReferences(project) &&
    hasValidVideoProjectCompositionJoinReferences(project) &&
    (project.transitions ?? []).every(
      (transition) =>
        clipIds.has(transition.leadingClipId) && clipIds.has(transition.trailingClipId)
    ) &&
    (project.motionRegions ?? []).every(
      (region) =>
        ((region.borderTarget !== 'window' &&
          region.spotlightTarget !== 'window' &&
          region.spotlightTarget !== 'scene' &&
          region.sourceBinding?.coordinateSpace !== 'source-window') ||
          project.clips.some(
            (clip) => clip.type === 'VIDEO' && clip.id === region.sourceBinding?.clipId
          )) &&
        (region.targetAction === null ||
          occurrences.some(
            (occurrence) =>
              occurrence.eventId === region.targetAction?.eventId &&
              occurrence.clipId === region.targetAction.clipId
          ))
    ) &&
    hasValidInteractionAnchorReferences(project) &&
    hasValidVideoProjectCursorSourceObservations(project)
  );
}

function hasValidInteractionAnchorReferences(project: VideoProject): boolean {
  if (
    project.cursorTrack?.samples.some(
      (sample) => sample.sourceAnchor && sample.timeBasis === 'project'
    )
  )
    return false;
  const factKeys = new Set<string>();
  for (const event of project.actionEvents) {
    const anchor = event.anchor;
    if (anchor.kind === 'project') continue;
    const key = JSON.stringify([anchor.recordingId, anchor.sourceInstanceId, anchor.sourceEventId]);
    if (factKeys.has(key)) return false;
    factKeys.add(key);
    if (
      !project.clips.some((clip) => {
        if (clip.type !== 'VIDEO' || clip.sourceInstanceId !== anchor.sourceInstanceId)
          return false;
        const asset = project.assets.find((item) => item.id === clip.assetId);
        return asset?.source.kind === 'recording'
          ? asset.source.recordingId === anchor.recordingId
          : asset?.source.kind === 'project-asset' &&
              asset.source.originRecordingId === anchor.recordingId;
      })
    )
      return false;
  }
  const anchors =
    project.cursorTrack?.samples.flatMap((sample) =>
      sample.sourceAnchor ? [{ anchor: sample.sourceAnchor, time: sample.time }] : []
    ) ?? [];
  return anchors.every(({ anchor, time }) =>
    hasValidInteractionAnchorReference(project, anchor, time)
  );
}

function hasValidInteractionAnchorReference(
  project: VideoProject,
  anchor: VideoProjectSourceTimeAnchor,
  time: number
): boolean {
  const clip = project.clips.find((item) => item.id === anchor.sourceClipId);
  if (!clip || clip.type !== VideoProjectClipType.VIDEO) {
    return false;
  }

  const asset = project.assets.find((item) => item.id === clip.assetId);
  const matchesRecording = Boolean(
    asset &&
    ((asset.source.kind === 'recording' && asset.source.recordingId === anchor.recordingId) ||
      (asset.source.kind === 'project-asset' &&
        asset.source.originRecordingId === anchor.recordingId))
  );
  return (
    matchesRecording &&
    anchor.sourceTime >= clip.sourceStart &&
    anchor.sourceTime <= clip.sourceStart + clip.sourceDuration &&
    Math.abs(
      clip.startTime + (anchor.sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1) - time
    ) <= 0.000_001
  );
}

function hasValidReferences(project: VideoProject): boolean {
  return (
    hasValidVideoProjectBaseReferences(project) &&
    hasValidEffectProjectReferences(project) &&
    hasValidVideoProjectSourceAudioReferences(project) &&
    hasValidVideoProjectSourceVoiceoverReferences(project) &&
    hasValidVideoProjectTextReferences(project) &&
    hasValidVideoProjectCommentReferences(project)
  );
}

function hasValidSceneBackgroundReferences(
  project: VideoProject,
  assetIds: ReadonlySet<string>
): boolean {
  const background = project.sceneBackground;
  return (
    (background?.kind !== VideoSceneBackgroundKind.IMAGE || assetIds.has(background.assetId)) &&
    (!background?.remembered?.image || assetIds.has(background.remembered.image.assetId))
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
