import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type {
  VideoEditorProjectState,
  VideoEditorProjectSliceSet,
  VideoEditorProjectSliceGet,
} from './contracts';
import { createVideoEditorProjectInsertionActions } from './insertion/actions';
import { createVideoEditorProjectClipPropertyActions } from './clip-property';
import { createVideoEditorProjectClipTimelineActions } from './clip-timeline/actions';
import { createVideoEditorProjectEffectActions } from './effects';
import { applyProjectUpdate } from './helpers';
import {
  createObjectTrackCorrectionAnchorUpserter,
  createObjectTrackDeleter,
  createObjectTrackAnchorPlacementStarter,
  createObjectTrackUpserter,
} from './object-tracks';
import { createVideoEditorProjectTrackActions } from './track/actions';

export { applyProjectUpdate } from './helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;
type VideoEditorStoreGet = VideoEditorProjectSliceGet;

type VideoEditorProjectActionKeys =
  | 'renameProject'
  | 'renameTrack'
  | 'addTrackLogicalLane'
  | 'addTrack'
  | 'deleteTrack'
  | 'moveTrack'
  | 'toggleTrackVisibility'
  | 'toggleTrackLock'
  | 'toggleUtilityLaneVisibility'
  | 'toggleUtilityLaneLock'
  | 'clearUtilityLane'
  | 'upsertAsset'
  | 'addAssetClip'
  | 'addAnnotationOverlay'
  | 'addVideoBlock'
  | 'addTextOverlay'
  | 'addSubtitleOverlay'
  | 'addShapeOverlay'
  | 'moveClip'
  | 'closeTrackGap'
  | 'trimClipStart'
  | 'trimClipEnd'
  | 'splitClipAt'
  | 'deleteClip'
  | 'duplicateClip'
  | 'detachClipGroup'
  | 'updateClipTransform'
  | 'updateClipMuted'
  | 'updateClipVolume'
  | 'updateClipAudioEnvelope'
  | 'updateClipFades'
  | 'updateClipTransitions'
  | 'updateClipPlaybackRate'
  | 'updateMediaClipFitMode'
  | 'updateMediaClipFitScalePercent'
  | 'updateMediaClipShadowIntensity'
  | 'updateMediaClipShadowMode'
  | 'applyMediaClipVisualsToTrack'
  | 'applyEffectDocument'
  | 'deleteEffectInstance'
  | 'duplicateEffectInstance'
  | 'moveEffectInstance'
  | 'updateEffectInstance'
  | 'upsertObjectTrack'
  | 'deleteObjectTrack'
  | 'startObjectTrackAnchorPlacement'
  | 'upsertObjectTrackCorrectionAnchor'
  | 'convertTextClipToAnnotation'
  | 'updateTextClipContent'
  | 'updateTextClipStyle'
  | 'updateAnnotationClipContent'
  | 'updateAnnotationClipStyle'
  | 'updateAnnotationClipTemplate'
  | 'updateSubtitleTrackStyle'
  | 'updateShapeClipStyle'
  | 'updateTransitionDuration'
  | 'updateTransitionEasing'
  | 'updateTransitionTemplate'
  | 'insertCursorSample'
  | 'deleteCursorSample'
  | 'clearCursorSampleSkinOverride'
  | 'updateCursorSampleVisibility'
  | 'updateCursorSampleInterpolation'
  | 'updateCursorSampleSkinOverride'
  | 'deleteActionEvent'
  | 'updateActionEventDetails'
  | 'updateMotionRegion'
  | 'deleteMotionRegion';

export function createVideoEditorProjectActions(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): Pick<VideoEditorProjectState, VideoEditorProjectActionKeys> {
  const trackActions = createVideoEditorProjectTrackActions(set);
  const clipTimelineActions = createVideoEditorProjectClipTimelineActions(set);
  const clipPropertyActions = createVideoEditorProjectClipPropertyActions(set);
  const effectActions = createVideoEditorProjectEffectActions(set, get);
  const insertionActions = createVideoEditorProjectInsertionActions(set, get);
  const upsertObjectTrack = createObjectTrackUpserter(set);
  const deleteObjectTrack = createObjectTrackDeleter(set);
  const upsertObjectTrackCorrectionAnchor = createObjectTrackCorrectionAnchorUpserter(set);
  const startObjectTrackAnchorPlacement = createObjectTrackAnchorPlacementStarter(set);
  const upsertAsset: VideoEditorProjectState['upsertAsset'] = (asset) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          assets: project.assets.some((item) => item.id === asset.id)
            ? project.assets.map((item) => (item.id === asset.id ? asset : item))
            : [...project.assets, asset],
        })
      )
    );

  return {
    ...trackActions,
    upsertAsset,
    ...insertionActions,
    ...clipTimelineActions,
    ...clipPropertyActions,
    deleteObjectTrack,
    startObjectTrackAnchorPlacement,
    ...effectActions,
    upsertObjectTrackCorrectionAnchor,
    upsertObjectTrack,
  };
}
