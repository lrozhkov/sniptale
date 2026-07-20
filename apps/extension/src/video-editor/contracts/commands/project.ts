import type {
  VideoBlockKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectAsset,
  VideoProjectClip,
  VideoProjectShapeType,
  VideoProjectUtilityLanes,
  VideoTrackKind,
} from '../../../features/video/project/types/index';
import type {
  VideoEditorAudioEnvelopePatch,
  VideoEditorFadePatch,
  VideoEditorTransitionPatch,
} from './patches';
import type { VideoEditorAnnotationActions } from './annotation';
import type { VideoEditorObjectTrackActions } from './object-tracks';
import type { VideoEditorTemporalActions } from './temporal';
import type { VideoEditorEffectInstanceActions } from './effect-instance';
import type { VideoEditorMoveClipAction } from './timeline';

export interface VideoEditorProjectActions
  extends
    VideoEditorAnnotationActions,
    VideoEditorObjectTrackActions,
    VideoEditorTemporalActions,
    VideoEditorEffectInstanceActions {
  renameProject: (name: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  addTrackLogicalLane: (trackId: string) => void;
  addTrack: (kind?: VideoTrackKind) => void;
  deleteTrack: (trackId: string) => void;
  moveTrack: (trackId: string, direction: 'up' | 'down') => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleUtilityLaneVisibility: (lane: keyof VideoProjectUtilityLanes) => void;
  toggleUtilityLaneLock: (lane: keyof VideoProjectUtilityLanes) => void;
  clearUtilityLane: (lane: keyof VideoProjectUtilityLanes) => void;
  upsertAsset: (asset: VideoProjectAsset) => void;
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
  trimClipStart: (clipId: string, nextStartTime: number) => void;
  trimClipEnd: (clipId: string, nextEndTime: number) => void;
  splitClipAt: (clipId: string, splitTime: number) => void;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  detachClipGroup: (clipId: string) => void;
  updateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  updateClipMuted: (clipId: string, muted: boolean) => void;
  updateClipVolume: (clipId: string, volume: number) => void;
  updateClipAudioEnvelope: (clipId: string, patch: VideoEditorAudioEnvelopePatch) => void;
  updateClipFades: (clipId: string, patch: VideoEditorFadePatch) => void;
  updateClipTransitions: (clipId: string, patch: VideoEditorTransitionPatch) => void;
  updateClipPlaybackRate: (clipId: string, playbackRate: number) => void;
  updateMediaClipFitMode: (clipId: string, fitMode: VideoMediaFitMode) => void;
  updateMediaClipFitScalePercent: (clipId: string, fitScalePercent: number) => void;
  updateMediaClipShadowIntensity: (clipId: string, shadowIntensity: number) => void;
  updateMediaClipShadowMode: (clipId: string, shadowMode: VideoMediaShadowMode) => void;
  applyMediaClipVisualsToTrack: (clipId: string) => void;
  closeTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  updateTextClipContent: (clipId: string, text: string) => void;
  updateTextClipStyle: (clipId: string, patch: Record<string, string | number>) => void;
  updateSubtitleTrackStyle: (trackId: string, patch: Record<string, string | number>) => void;
  updateShapeClipStyle: (clipId: string, patch: Record<string, string | number>) => void;
}
