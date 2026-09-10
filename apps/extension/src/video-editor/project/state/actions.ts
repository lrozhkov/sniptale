import { getProjectAssetUseCounts } from '../../../features/video/project/media-usage';
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
  | 'renameAsset'
  | 'upsertAsset'
  | 'upsertAssets'
  | 'removeUnusedAssets'
  | 'addAssetClip'
  | 'appendMaterial'
  | 'insertMaterial'
  | 'overlayMaterial'
  | 'addAnnotationOverlay'
  | 'addVideoBlock'
  | 'addTextOverlay'
  | 'addSubtitleOverlay'
  | 'addShapeOverlay'
  | 'swapClip'
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
  | 'selectEffectInstance'
  | 'setEffectTargetBypassed'
  | 'setClipEffectsBypassed'
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
  | 'updateActionPresentation'
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
  const upsertAssets: VideoEditorProjectState['upsertAssets'] = (assets) => {
    if (assets.length === 0) return;
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const replacements = new Map(assets.map((asset) => [asset.id, asset]));
        const nextAssets = project.assets.map((asset) => {
          const replacement = replacements.get(asset.id) ?? asset;
          replacements.delete(asset.id);
          return replacement;
        });
        nextAssets.push(...replacements.values());
        return applyVideoProjectMutationPatch(project, { assets: nextAssets });
      })
    );
  };

  return {
    ...trackActions,
    upsertAsset: (asset) => upsertAssets([asset]),
    upsertAssets,
    renameAsset: (assetId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const asset = project.assets.find(({ id }) => id === assetId);
          if (!asset || asset.name === trimmed) return project;
          return applyVideoProjectMutationPatch(project, {
            assets: project.assets.map((item) =>
              item.id === assetId ? { ...item, name: trimmed } : item
            ),
          });
        })
      );
    },
    removeUnusedAssets: (assetIds) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const used = getProjectAssetUseCounts(project);
          const requested = assetIds ? new Set(assetIds) : null;
          const assets = project.assets.filter(
            (asset) => used.has(asset.id) || (requested !== null && !requested.has(asset.id))
          );
          return assets.length === project.assets.length
            ? project
            : applyVideoProjectMutationPatch(project, { assets });
        })
      ),
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
