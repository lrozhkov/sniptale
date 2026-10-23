import type { applyProjectSourceVoiceoverEdit } from '../../../features/video/project/source-voiceover';
import type { VideoProjectBookendPresets } from '../../../features/video/project/scene/bookend-presets-types';
import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
import type { VideoEditorAnnotationActions } from './annotation';
import type { VideoEditorObjectTrackActions } from './object-tracks';
import type { VideoEditorTemporalActions } from './temporal';
import type { VideoEditorEffectInstanceActions } from './effect-instance';
import type { VideoEditorMoveClipAction, VideoEditorTrimClipAction } from './timeline';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  VideoBlockKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProject,
  VideoProjectAsset,
  VideoProjectClip,
  VideoProjectShapeType,
  VideoProjectUtilityLanes,
  VideoTrackKind,
  VideoProjectTrackRole,
} from '../../../features/video/project/types/index';
import type {
  VideoEditorMediaClipEdit,
  VideoEditorAudioEnvelopePatch,
  VideoEditorFadePatch,
  VideoEditorTransitionPatch,
} from './patches';
import type {
  VideoEditorBookendPlacementResult,
  VideoEditorBookendPresetUpdateResult,
  VideoEditorCompositionJoinUpdateResult,
  VideoEditorMaterialPlacementResult,
  VideoEditorMaterialSourceRange,
  VideoEditorMaterialTarget,
} from '../insertion';

export interface VideoEditorProjectActions
  extends
    VideoEditorAnnotationActions,
    VideoEditorObjectTrackActions,
    VideoEditorTemporalActions,
    VideoEditorEffectInstanceActions {
  editSourceVoiceover: (
    expectedProject: VideoProject,
    documentId: string,
    patch: Exclude<Parameters<typeof applyProjectSourceVoiceoverEdit>[2], null>
  ) => boolean;
  deleteSourceVoiceover: (documentId: string) => void;
  duplicateSourceVoiceover: (documentId: string) => string | null;
  renameProject: (name: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  addTrackLogicalLane: (trackId: string) => void;
  addTrack: (kind?: VideoTrackKind, role?: VideoProjectTrackRole) => void;
  deleteTrack: (trackId: string) => void;
  moveTrack: (trackId: string, direction: 'up' | 'down') => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleUtilityLaneVisibility: (lane: keyof VideoProjectUtilityLanes) => void;
  toggleUtilityLaneLock: (lane: keyof VideoProjectUtilityLanes) => void;
  clearUtilityLane: (lane: keyof VideoProjectUtilityLanes) => void;
  /** Renames the project material without changing its source or existing clip labels. */
  renameAsset: (assetId: string, name: string) => void;
  upsertAsset: (asset: VideoProjectAsset) => void;
  upsertAssets: (assets: readonly VideoProjectAsset[]) => void;
  /** Removes unreferenced materials from the project while preserving history and source media. */
  removeUnusedAssets: (assetIds?: readonly string[]) => void;
  /** Appends after all montage clips, using the selected compatible track or default. */
  appendMaterial: (
    assetId: string,
    range?: VideoEditorMaterialSourceRange,
    telemetry?: RecordingTelemetryEntry
  ) => VideoEditorMaterialPlacementResult;
  /** Accepts a recipe independently of any existing timeline instances. */
  updateBookendPresets: (
    value: VideoProjectBookendPresets | undefined,
    expectedProject: VideoProject
  ) => VideoEditorBookendPresetUpdateResult;
  /** Accepts exact clip-edge descriptors without changing the referenced timeline clips. */
  updateCompositionJoins: (
    value: VideoProject['compositionJoins'],
    expectedProject: VideoProject
  ) => VideoEditorCompositionJoinUpdateResult;
  /** Inserts an editable edge material against the exact accepted inspector snapshot. */
  placeBookendMaterial: (
    assetId: string,
    side: 'intro' | 'outro',
    expectedProject: VideoProject
  ) => VideoEditorBookendPlacementResult;
  /** Inserts at the playhead and opens an equal gap across the montage. */
  insertMaterial: (
    assetId: string,
    range?: VideoEditorMaterialSourceRange,
    telemetry?: RecordingTelemetryEntry
  ) => VideoEditorMaterialPlacementResult;
  /** Places at the playhead on fresh tracks, preserving existing clips. */
  overlayMaterial: (
    assetId: string,
    range?: VideoEditorMaterialSourceRange,
    telemetry?: RecordingTelemetryEntry
  ) => VideoEditorMaterialPlacementResult;
  /** Places a complete material at an admitted exact destination in one history step. */
  placeMaterial: (
    assetId: string,
    target: VideoEditorMaterialTarget,
    telemetry?: RecordingTelemetryEntry
  ) => VideoEditorMaterialPlacementResult;
  addAssetClip: (
    asset: VideoProjectAsset,
    trackId?: string | null,
    startTime?: number,
    timelineLaneId?: string | null
  ) => string | null;
  addTextOverlay: (trackId?: string | null, startTime?: number) => string | null;
  addVideoBlock: (
    blockKind: VideoBlockKind,
    trackId?: string | null,
    startTime?: number
  ) => string | null;
  addSubtitleOverlay: (trackId?: string | null, startTime?: number) => string | null;
  addShapeOverlay: (
    shapeType: VideoProjectShapeType,
    trackId?: string | null,
    startTime?: number
  ) => string | null;
  moveClip: VideoEditorMoveClipAction;
  swapClip: (clipId: string, direction: 'left' | 'right') => void;
  trimClipStart: VideoEditorTrimClipAction;
  trimClipEnd: VideoEditorTrimClipAction;
  splitClipAt: (clipId: string, splitTime: number) => void;
  deleteClip: (clipId: string | readonly string[]) => void;
  duplicateClip: (clipId: string) => void;
  detachClipGroup: (clipId: string) => void;
  updateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  updateClipMuted: (clipId: string, muted: boolean) => void;
  updateClipVolume: (clipId: string, volume: number) => void;
  updateClipAudioEnvelope: (clipId: string, patch: VideoEditorAudioEnvelopePatch) => void;
  updateClipFades: (clipId: string, patch: VideoEditorFadePatch) => void;
  updateClipTransitions: (clipId: string, patch: VideoEditorTransitionPatch) => void;
  updateClipPlaybackRate: (clipId: string, playbackRate: number) => void;
  updateMediaClipFitMode: (
    clipId: string,
    fitMode: VideoMediaFitMode,
    fitScalePercent?: number
  ) => void;
  updateMediaClipFitScalePercent: (clipId: string, fitScalePercent: number) => void;
  updateMediaClipShadowIntensity: (clipId: string, shadowIntensity: number) => void;
  updateMediaClipShadowMode: (clipId: string, shadowMode: VideoMediaShadowMode) => void;
  /** Edits source crop through the existing project history owner. */
  editMediaClip: (clipId: string, edit: VideoEditorMediaClipEdit) => void;
  updateMediaClipShadowColor: (clipId: string, shadowColor: string) => void;
  updateMediaClipWindowHeader: (clipId: string, windowHeader: WindowHeader | undefined) => void;
  applyMediaClipVisualsToTrack: (clipId: string) => void;
  closeTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  updateTextClipContent: (clipId: string, text: string) => void;
  updateTextClipStyle: (clipId: string, patch: Record<string, string | number>) => void;
  updateSubtitleTrackStyle: (trackId: string, patch: Record<string, string | number>) => void;
  updateShapeClipStyle: (clipId: string, patch: Record<string, string | number>) => void;
}
