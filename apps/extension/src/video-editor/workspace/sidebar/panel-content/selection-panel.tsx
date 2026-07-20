import { createSceneSelection } from '../../../project/selection/model';
import {
  createSelectionPanelOptionalPlacementProps,
  createSelectionPanelOptionalProps,
  createSelectionPanelOptionalUpdateProps,
  createSelectionPanelEffectInstanceProps,
} from '../panel-content-selection-props';
import { WorkspaceSidebarSelectionBody } from '../selection/inspection/body';
import {
  createSelectionAnnotationUpdateDefaults,
  createSelectionSceneClipUpdateDefaults,
} from '../selection/inspection/props-defaults';
import type {
  WorkspaceSidebarSelectionPanelProps,
  WorkspaceSidebarSelectionPanelSourceProps,
} from '../contracts/selection-panel';

function createSelectionPanelOptionalActionProps(props: WorkspaceSidebarSelectionPanelProps) {
  return {
    ...(props.onApplyMediaClipVisualsToTrack
      ? { onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack }
      : {}),
    ...(props.onConvertTextClipToAnnotation
      ? { onConvertTextClipToAnnotation: props.onConvertTextClipToAnnotation }
      : {}),
    ...(props.onDeleteTrack ? { onDeleteTrack: props.onDeleteTrack } : {}),
    ...(props.onDeleteObjectTrack ? { onDeleteObjectTrack: props.onDeleteObjectTrack } : {}),
    ...(props.onSelectObjectTrack ? { onSelectObjectTrack: props.onSelectObjectTrack } : {}),
    ...(props.cursorDetection ? { cursorDetection: props.cursorDetection } : {}),
    ...(props.onRenameTrack ? { onRenameTrack: props.onRenameTrack } : {}),
    ...(props.onUpdateMediaClipFitScalePercent
      ? { onUpdateMediaClipFitScalePercent: props.onUpdateMediaClipFitScalePercent }
      : {}),
    ...(props.onUpdateMediaClipShadowIntensity
      ? { onUpdateMediaClipShadowIntensity: props.onUpdateMediaClipShadowIntensity }
      : {}),
    ...(props.onUpdateMediaClipShadowMode
      ? { onUpdateMediaClipShadowMode: props.onUpdateMediaClipShadowMode }
      : {}),
    ...(props.onUpdateSubtitleTrackStyle
      ? { onUpdateSubtitleTrackStyle: props.onUpdateSubtitleTrackStyle }
      : {}),
    ...(props.onUpdateEffectInstance
      ? { onUpdateEffectInstance: props.onUpdateEffectInstance }
      : {}),
    ...(props.onDeleteEffectInstance
      ? { onDeleteEffectInstance: props.onDeleteEffectInstance }
      : {}),
    ...(props.onUpsertObjectTrackCorrectionAnchor
      ? { onUpsertObjectTrackCorrectionAnchor: props.onUpsertObjectTrackCorrectionAnchor }
      : {}),
  };
}

function createSelectionBodyStateProps(props: WorkspaceSidebarSelectionPanelProps) {
  return {
    project: props.project,
    selection: props.selection,
    selectedClip: props.selectedClip,
    selectedTransition: props.selectedTransition,
    selectedCursorSample: props.selectedCursorSample,
    selectedActionEvent: props.selectedActionEvent,
    selectedMotionRegion: props.selectedMotionRegion,
    ...(props.selectedObjectTrack === undefined
      ? {}
      : { selectedObjectTrack: props.selectedObjectTrack }),
    selectedTrack: props.selectedTrack,
    placementMode: props.placementMode,
    recentColors: props.recentColors,
  };
}

function createSelectionBodyActionProps(props: WorkspaceSidebarSelectionPanelProps) {
  return {
    onPreviewSceneBackground: props.onPreviewSceneBackground,
    onRememberRecentColor: props.onRememberRecentColor,
    onResetSceneBackgroundPreview: props.onResetSceneBackgroundPreview,
    onSetSceneBackground: props.onSetSceneBackground,
    onResizeProject: props.onResizeProject,
    onEnableCursorTrack: props.onEnableCursorTrack,
    onSetCursorCaptureMode: props.onSetCursorCaptureMode,
    onUpdateCursorSkin: props.onUpdateCursorSkin,
    onUpdateCursorSampleSkinOverride: props.onUpdateCursorSampleSkinOverride,
    onClearCursorSampleSkinOverride: props.onClearCursorSampleSkinOverride,
    onAddActionEvent: props.onAddActionEvent,
    onAddMotionRegion: props.onAddMotionRegion,
    onUpdateCursorSampleInterpolation: props.onUpdateCursorSampleInterpolation,
    onUpdateCursorSampleVisibility: props.onUpdateCursorSampleVisibility,
    onUpdateActionEventDetails: props.onUpdateActionEventDetails,
    onDeleteMotionRegion: props.onDeleteMotionRegion,
    onGenerateMotionPathFromCursor: props.onGenerateMotionPathFromCursor ?? (() => undefined),
    onStartActionPointPlacement: props.onStartActionPointPlacement,
    onStartMotionAreaPlacement: props.onStartMotionAreaPlacement,
    onStartMotionFocusPlacement: props.onStartMotionFocusPlacement,
    onStartObjectTrackAnchorPlacement: props.onStartObjectTrackAnchorPlacement ?? (() => undefined),
    onClearPlacementMode: props.onClearPlacementMode,
    onUpdateMotionRegion: props.onUpdateMotionRegion,
    onUpdateTransitionDuration: props.onUpdateTransitionDuration,
    onUpdateTransitionEasing: props.onUpdateTransitionEasing,
    onUpdateTransitionTemplate: props.onUpdateTransitionTemplate,
    onDetachClipGroup: props.onDetachClipGroup,
    onUpdateClipTransform: props.onUpdateClipTransform,
    onUpdateClipMuted: props.onUpdateClipMuted,
    onUpdateClipVolume: props.onUpdateClipVolume,
    onUpdateClipAudioEnvelope: props.onUpdateClipAudioEnvelope,
    onUpdateClipFades: props.onUpdateClipFades,
    onUpdateClipPlaybackRate: props.onUpdateClipPlaybackRate ?? (() => undefined),
    onUpdateMediaClipFitMode: props.onUpdateMediaClipFitMode,
    ...createSelectionAnnotationUpdateDefaults(props),
    onUpdateTextContent: props.onUpdateTextContent,
    onUpdateTextStyle: props.onUpdateTextStyle,
    onUpdateShapeStyle: props.onUpdateShapeStyle,
  };
}

function createSelectionBodyProps(props: WorkspaceSidebarSelectionPanelProps) {
  return {
    ...createSelectionBodyStateProps(props),
    ...createSelectionBodyActionProps(props),
    ...createSelectionPanelOptionalActionProps(props),
  };
}

export function createSelectionPanelProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): WorkspaceSidebarSelectionPanelProps {
  return {
    ...createSelectionPanelStateProps(props),
    ...createSelectionPanelUpdateProps(props),
    ...createSelectionPanelOptionalPlacementProps(props),
    ...createSelectionPanelOptionalUpdateProps(props),
    ...createSelectionPanelEffectInstanceProps(props),
    ...createSelectionPanelOptionalProps(props),
  };
}

function createSelectionPanelStateProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'placementMode'
  | 'project'
  | 'recentColors'
  | 'selectedActionEvent'
  | 'selectedClip'
  | 'selectedCursorSample'
  | 'selectedMotionRegion'
  | 'selectedObjectTrack'
  | 'selectedTrack'
  | 'selectedTransition'
  | 'selection'
> {
  return {
    selection: props.selection ?? createSceneSelection(),
    project: props.project,
    recentColors: props.recentColors ?? [],
    selectedClip: props.selectedClip,
    selectedActionEvent: props.selectedActionEvent ?? null,
    selectedCursorSample: props.selectedCursorSample ?? null,
    selectedMotionRegion: props.selectedMotionRegion ?? null,
    selectedObjectTrack: props.selectedObjectTrack ?? null,
    selectedTrack: props.selectedTrack,
    selectedTransition: props.selectedTransition ?? null,
    placementMode: props.placementMode ?? null,
  };
}

function createSelectionPanelUpdateProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'onClearCursorSampleSkinOverride'
  | 'onConvertTextClipToAnnotation'
  | 'onDetachClipGroup'
  | 'onResizeProject'
  | 'onPreviewSceneBackground'
  | 'onRememberRecentColor'
  | 'onResetSceneBackgroundPreview'
  | 'onSetCursorCaptureMode'
  | 'onSetSceneBackground'
  | 'onUpdateClipAudioEnvelope'
  | 'onUpdateClipFades'
  | 'onUpdateClipMuted'
  | 'onUpdateClipPlaybackRate'
  | 'onUpdateClipTransform'
  | 'onUpdateClipVolume'
  | 'onUpdateCursorSampleSkinOverride'
  | 'onUpdateCursorSkin'
  | 'onUpdateMediaClipFitMode'
  | 'onUpdateAnnotationClipContent'
  | 'onUpdateAnnotationClipStyle'
  | 'onUpdateAnnotationClipTemplate'
  | 'onUpdateShapeStyle'
  | 'onUpdateTextContent'
  | 'onUpdateTextStyle'
  | 'onUpdateTransitionTemplate'
> {
  return {
    ...createSelectionPanelBaseUpdateProps(props),
    ...createSelectionPanelAnnotationUpdateProps(props),
    onConvertTextClipToAnnotation: props.onConvertTextClipToAnnotation,
    onUpdateShapeStyle: props.onUpdateShapeStyle,
    onUpdateTextContent: props.onUpdateTextContent,
    onUpdateTextStyle: props.onUpdateTextStyle,
    onUpdateTransitionTemplate: props.onUpdateTransitionTemplate ?? (() => undefined),
  };
}

function createSelectionPanelBaseUpdateProps(props: WorkspaceSidebarSelectionPanelSourceProps) {
  return {
    ...createSelectionSceneClipUpdateDefaults(props),
    onSetCursorCaptureMode: props.onSetCursorCaptureMode,
    onUpdateCursorSkin: props.onUpdateCursorSkin,
    onUpdateCursorSampleSkinOverride: props.onUpdateCursorSampleSkinOverride ?? (() => undefined),
    onClearCursorSampleSkinOverride: props.onClearCursorSampleSkinOverride ?? (() => undefined),
  };
}

function createSelectionPanelAnnotationUpdateProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
) {
  return {
    onUpdateAnnotationClipContent: props.onUpdateAnnotationClipContent,
    onUpdateAnnotationClipStyle: props.onUpdateAnnotationClipStyle,
    onUpdateAnnotationClipTemplate: props.onUpdateAnnotationClipTemplate,
  };
}

export function WorkspaceSidebarSelectionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  return <WorkspaceSidebarSelectionBody {...createSelectionBodyProps(props)} />;
}
