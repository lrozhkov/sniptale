import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoObjectTrack } from '../../../../features/video/project/object-tracks';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectCursorSample,
  VideoProjectMotionRegion,
  VideoProjectTrack,
  VideoProjectTransition,
} from '../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from './props';

export interface WorkspaceSidebarSelectionPanelProps {
  onAddActionEvent: WorkspaceSidebarProps['onAddActionEvent'];
  onAddMotionRegion: NonNullable<WorkspaceSidebarProps['onAddMotionRegion']>;
  onClearCursorSampleSkinOverride: NonNullable<
    WorkspaceSidebarProps['onClearCursorSampleSkinOverride']
  >;
  onClearPlacementMode: NonNullable<WorkspaceSidebarProps['onClearPlacementMode']>;
  onDeleteActionEvent: NonNullable<WorkspaceSidebarProps['onDeleteActionEvent']>;
  onDeleteCursorSample: NonNullable<WorkspaceSidebarProps['onDeleteCursorSample']>;
  onDeleteMotionRegion: NonNullable<WorkspaceSidebarProps['onDeleteMotionRegion']>;
  onDeleteObjectTrack?: WorkspaceSidebarProps['onDeleteObjectTrack'];
  onSelectObjectTrack?: WorkspaceSidebarProps['onSelectObjectTrack'];
  onGenerateMotionPathFromCursor?: WorkspaceSidebarProps['onGenerateMotionPathFromCursor'];
  onDeleteTrack?: WorkspaceSidebarProps['onDeleteTrack'];
  onDetachClipGroup: WorkspaceSidebarProps['onDetachClipGroup'];
  onEnableCursorTrack: NonNullable<WorkspaceSidebarProps['onEnableCursorTrack']>;
  onInsertCursorSample: NonNullable<WorkspaceSidebarProps['onInsertCursorSample']>;
  onRenameTrack?: WorkspaceSidebarProps['onRenameTrack'];
  onResizeProject: WorkspaceSidebarProps['onResizeProject'];
  onPreviewSceneBackground: NonNullable<WorkspaceSidebarProps['onPreviewSceneBackground']>;
  onRememberRecentColor: NonNullable<WorkspaceSidebarProps['onRememberRecentColor']>;
  onResetSceneBackgroundPreview: NonNullable<
    WorkspaceSidebarProps['onResetSceneBackgroundPreview']
  >;
  onSetCursorCaptureMode: WorkspaceSidebarProps['onSetCursorCaptureMode'];
  onSetSceneBackground: WorkspaceSidebarProps['onSetSceneBackground'];
  onStartActionPointPlacement: NonNullable<WorkspaceSidebarProps['onStartActionPointPlacement']>;
  onStartMotionAreaPlacement: NonNullable<WorkspaceSidebarProps['onStartMotionAreaPlacement']>;
  onStartMotionFocusPlacement: NonNullable<WorkspaceSidebarProps['onStartMotionFocusPlacement']>;
  onStartMotionPathStopAreaPlacement?: WorkspaceSidebarProps['onStartMotionPathStopAreaPlacement'];
  onStartMotionPathStopPointPlacement?: WorkspaceSidebarProps['onStartMotionPathStopPointPlacement'];
  onStartObjectTrackAnchorPlacement?: WorkspaceSidebarProps['onStartObjectTrackAnchorPlacement'];
  onUpdateActionEventDetails: NonNullable<WorkspaceSidebarProps['onUpdateActionEventDetails']>;
  onUpdateAnnotationClipContent?: WorkspaceSidebarProps['onUpdateAnnotationClipContent'];
  onUpdateAnnotationClipStyle?: WorkspaceSidebarProps['onUpdateAnnotationClipStyle'];
  onUpdateAnnotationClipTemplate?: WorkspaceSidebarProps['onUpdateAnnotationClipTemplate'];
  onUpdateClipAudioEnvelope: WorkspaceSidebarProps['onUpdateClipAudioEnvelope'];
  onUpdateClipFades: WorkspaceSidebarProps['onUpdateClipFades'];
  onUpdateClipPlaybackRate?: WorkspaceSidebarProps['onUpdateClipPlaybackRate'];
  onUpdateClipMuted: WorkspaceSidebarProps['onUpdateClipMuted'];
  onUpdateClipTransform: WorkspaceSidebarProps['onUpdateClipTransform'];
  onUpdateClipVolume: WorkspaceSidebarProps['onUpdateClipVolume'];
  onUpdateCursorSampleInterpolation: NonNullable<
    WorkspaceSidebarProps['onUpdateCursorSampleInterpolation']
  >;
  onUpdateCursorSampleSkinOverride: NonNullable<
    WorkspaceSidebarProps['onUpdateCursorSampleSkinOverride']
  >;
  onUpdateCursorSampleVisibility: NonNullable<
    WorkspaceSidebarProps['onUpdateCursorSampleVisibility']
  >;
  onUpdateCursorSkin: WorkspaceSidebarProps['onUpdateCursorSkin'];
  onUpdateMediaClipFitMode: WorkspaceSidebarProps['onUpdateMediaClipFitMode'];
  onUpdateMediaClipFitScalePercent?: WorkspaceSidebarProps['onUpdateMediaClipFitScalePercent'];
  onUpdateMediaClipShadowIntensity?: WorkspaceSidebarProps['onUpdateMediaClipShadowIntensity'];
  onUpdateMediaClipShadowMode?: WorkspaceSidebarProps['onUpdateMediaClipShadowMode'];
  onApplyMediaClipVisualsToTrack?: WorkspaceSidebarProps['onApplyMediaClipVisualsToTrack'];
  onConvertTextClipToAnnotation?: WorkspaceSidebarProps['onConvertTextClipToAnnotation'];
  onUpdateMotionRegion: NonNullable<WorkspaceSidebarProps['onUpdateMotionRegion']>;
  onUpdateShapeStyle: WorkspaceSidebarProps['onUpdateShapeStyle'];
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarProps['onUpdateSubtitleTrackStyle'];
  onUpdateTextContent: WorkspaceSidebarProps['onUpdateTextContent'];
  onUpdateTextStyle: WorkspaceSidebarProps['onUpdateTextStyle'];
  onUpdateTransitionDuration: NonNullable<WorkspaceSidebarProps['onUpdateTransitionDuration']>;
  onUpdateTransitionEasing: NonNullable<WorkspaceSidebarProps['onUpdateTransitionEasing']>;
  onUpdateTransitionTemplate: NonNullable<WorkspaceSidebarProps['onUpdateTransitionTemplate']>;
  onDeleteEffectInstance?: WorkspaceSidebarProps['onDeleteEffectInstance'];
  onDuplicateEffectInstance?: WorkspaceSidebarProps['onDuplicateEffectInstance'];
  onMoveEffectInstance?: WorkspaceSidebarProps['onMoveEffectInstance'];
  onUpdateEffectInstance?: WorkspaceSidebarProps['onUpdateEffectInstance'];
  onUpsertObjectTrackCorrectionAnchor?: WorkspaceSidebarProps['onUpsertObjectTrackCorrectionAnchor'];
  cursorDetection?: WorkspaceSidebarProps['cursorDetection'];
  placementMode: VideoEditorPlacementMode | null;
  project: VideoProject;
  recentColors: string[];
  selectedActionEvent: VideoProject['actionEvents'][number] | null;
  selectedClip: VideoProjectClip | null;
  selectedCursorSample: VideoProjectCursorSample | null;
  selectedMotionRegion: VideoProjectMotionRegion | null;
  selectedObjectTrack?: VideoObjectTrack | null;
  selectedTrack: VideoProjectTrack | null;
  selectedTransition: VideoProjectTransition | null;
  selection: VideoEditorSelection;
}

type WorkspaceSidebarSelectionPanelSourcePropKeys = Extract<
  keyof WorkspaceSidebarSelectionPanelProps,
  keyof WorkspaceSidebarProps
>;

export type WorkspaceSidebarSelectionPanelSourceProps = Pick<
  WorkspaceSidebarProps,
  WorkspaceSidebarSelectionPanelSourcePropKeys
>;
