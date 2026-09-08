import { createSceneSelection } from '../../../../project/selection/model';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { WorkspaceSidebarInspectPanel } from '../inspect';
import {
  createSelectionAnnotationUpdateDefaults,
  createSelectionSceneClipUpdateDefaults,
} from './props-defaults';

type WorkspaceSidebarSelectionBodyProps = Partial<
  Pick<
    WorkspaceSidebarProps,
    | 'gridSettings'
    | 'typingProject'
    | 'recordingTelemetry'
    | 'onApplyTypingCompression'
    | 'project'
    | 'selection'
    | 'selectedClip'
    | 'onApplyCameraLayout'
    | 'onSplitCameraInterval'
    | 'canSplitCameraInterval'
    | 'selectedTransition'
    | 'selectedCursorSample'
    | 'currentTime'
    | 'selectedActionOccurrence'
    | 'selectedMotionRegion'
    | 'selectedObjectTrack'
    | 'selectedTrack'
    | 'placementMode'
    | 'onSetSceneBackground'
    | 'onPreviewSceneBackground'
    | 'onRememberRecentColor'
    | 'onResetSceneBackgroundPreview'
    | 'recentColors'
    | 'onResizeProject'
    | 'onEnableCursorTrack'
    | 'onSetCursorCaptureMode'
    | 'onUpdateCursorSkin'
    | 'onUpdateCursorSampleSkinOverride'
    | 'onClearCursorSampleSkinOverride'
    | 'onAddActionEvent'
    | 'onAddMotionRegion'
    | 'onDeleteActionEvent'
    | 'onDeleteTrack'
    | 'onDeleteCursorSample'
    | 'onDeleteObjectTrack'
    | 'onSelectObjectTrack'
    | 'onInsertCursorSample'
    | 'onUpdateCursorSampleInterpolation'
    | 'onUpdateCursorSampleVisibility'
    | 'onUpdateActionPresentation'
    | 'onUpdateActionEventDetails'
    | 'onUpdateAnnotationClipContent'
    | 'onUpdateAnnotationClipStyle'
    | 'onUpdateAnnotationClipTemplate'
    | 'onDeleteMotionRegion'
    | 'onStartActionPointPlacement'
    | 'onStartMotionAreaPlacement'
    | 'onStartMotionFocusPlacement'
    | 'onStartObjectTrackAnchorPlacement'
    | 'onClearPlacementMode'
    | 'onUpdateMotionRegion'
    | 'onUpdateTransitionDuration'
    | 'onUpdateTransitionEasing'
    | 'onSwapClip'
    | 'onTrimClipStart'
    | 'onTrimClipEnd'
    | 'onDetachClipGroup'
    | 'onUpdateClipTransform'
    | 'onUpdateClipMuted'
    | 'onUpdateClipVolume'
    | 'onUpdateClipAudioEnvelope'
    | 'onUpdateClipFades'
    | 'onUpdateClipPlaybackRate'
    | 'onUpdateMediaClipFitMode'
    | 'onUpdateMediaClipFitScalePercent'
    | 'onUpdateMediaClipShadowIntensity'
    | 'onUpdateMediaClipShadowMode'
    | 'onApplyMediaClipVisualsToTrack'
    | 'onConvertTextClipToAnnotation'
    | 'onRenameTrack'
    | 'onToggleTrackLock'
    | 'onToggleUtilityLaneVisibility'
    | 'onToggleUtilityLaneLock'
    | 'onClearUtilityLane'
    | 'onToggleTrackVisibility'
    | 'onUpdateTextContent'
    | 'onUpdateTextStyle'
    | 'onUpdateSubtitleTrackStyle'
    | 'onUpdateShapeStyle'
    | 'onUpdateTransitionTemplate'
    | 'onDeleteEffectInstance'
    | 'onDuplicateEffectInstance'
    | 'onMoveEffectInstance'
    | 'onUpdateEffectInstance'
    | 'onUpsertObjectTrackCorrectionAnchor'
  >
> &
  Pick<
    WorkspaceSidebarProps,
    | 'project'
    | 'recentColors'
    | 'onPreviewSceneBackground'
    | 'onRememberRecentColor'
    | 'onResetSceneBackgroundPreview'
    | 'onSetSceneBackground'
    | 'onResizeProject'
    | 'onSwapClip'
    | 'onTrimClipStart'
    | 'onTrimClipEnd'
    | 'onDetachClipGroup'
    | 'onUpdateClipTransform'
    | 'onUpdateClipMuted'
    | 'onUpdateClipVolume'
    | 'onUpdateClipAudioEnvelope'
    | 'onUpdateClipFades'
    | 'onUpdateClipPlaybackRate'
    | 'onUpdateMediaClipFitMode'
    | 'onUpdateMediaClipFitScalePercent'
    | 'onUpdateMediaClipShadowIntensity'
    | 'onApplyMediaClipVisualsToTrack'
    | 'onRenameTrack'
    | 'onUpdateTextContent'
    | 'onUpdateTextStyle'
    | 'onUpdateSubtitleTrackStyle'
    | 'onUpdateShapeStyle'
  >;

export function WorkspaceSidebarSelectionBody(props: WorkspaceSidebarSelectionBodyProps) {
  return <WorkspaceSidebarInspectPanel {...createInspectPanelProps(props)} />;
}

function createInspectPanelProps(props: WorkspaceSidebarSelectionBodyProps) {
  return {
    ...(props.gridSettings ? { gridSettings: props.gridSettings } : {}),
    ...(props.typingProject ? { typingProject: props.typingProject } : {}),
    ...(props.recordingTelemetry ? { recordingTelemetry: props.recordingTelemetry } : {}),
    ...(props.onApplyTypingCompression
      ? { onApplyTypingCompression: props.onApplyTypingCompression }
      : {}),
    project: props.project,
    selection: props.selection ?? createSceneSelection(),
    selectedClip: props.selectedClip ?? null,
    ...(props.onApplyCameraLayout ? { onApplyCameraLayout: props.onApplyCameraLayout } : {}),
    ...(props.onSplitCameraInterval ? { onSplitCameraInterval: props.onSplitCameraInterval } : {}),
    canSplitCameraInterval: props.canSplitCameraInterval ?? false,
    ...(props.currentTime === undefined ? {} : { currentTime: props.currentTime }),
    selectedActionOccurrence: props.selectedActionOccurrence ?? null,
    selectedCursorSample: props.selectedCursorSample ?? null,
    selectedMotionRegion: props.selectedMotionRegion ?? null,
    selectedObjectTrack: props.selectedObjectTrack ?? null,
    selectedTrack: props.selectedTrack ?? null,
    selectedTransition: props.selectedTransition ?? null,
    placementMode: props.placementMode ?? null,
    recentColors: props.recentColors ?? [],
    ...createSelectionSceneClipUpdateDefaults(props),
    onUpdateMediaClipFitScalePercent: props.onUpdateMediaClipFitScalePercent,
    onUpdateMediaClipShadowIntensity: props.onUpdateMediaClipShadowIntensity,
    onUpdateMediaClipShadowMode: props.onUpdateMediaClipShadowMode,
    onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack,
    ...createSelectionAnnotationUpdateDefaults(props),
    onRenameTrack: props.onRenameTrack,
    onToggleTrackLock: props.onToggleTrackLock,
    onToggleUtilityLaneVisibility: props.onToggleUtilityLaneVisibility,
    onToggleUtilityLaneLock: props.onToggleUtilityLaneLock,
    onClearUtilityLane: props.onClearUtilityLane,
    onToggleTrackVisibility: props.onToggleTrackVisibility,
    onUpdateShapeStyle: props.onUpdateShapeStyle,
    onUpdateSubtitleTrackStyle: props.onUpdateSubtitleTrackStyle,
    onUpdateTextContent: props.onUpdateTextContent,
    onUpdateTextStyle: props.onUpdateTextStyle,
    ...createInspectPanelOptionalProps(props),
  };
}

function createInspectPanelOptionalProps(props: WorkspaceSidebarSelectionBodyProps) {
  return {
    onAddActionEvent: props.onAddActionEvent ?? (() => undefined),
    onAddMotionRegion: props.onAddMotionRegion ?? (() => undefined),
    onDeleteActionEvent: props.onDeleteActionEvent ?? (() => undefined),
    onDeleteTrack: props.onDeleteTrack ?? (() => undefined),
    onDeleteCursorSample: props.onDeleteCursorSample ?? (() => undefined),
    onDeleteObjectTrack: props.onDeleteObjectTrack ?? (() => undefined),
    onSelectObjectTrack: props.onSelectObjectTrack ?? (() => undefined),

    onEnableCursorTrack: props.onEnableCursorTrack ?? (() => undefined),
    onInsertCursorSample: props.onInsertCursorSample ?? (() => undefined),
    onSetCursorCaptureMode: props.onSetCursorCaptureMode ?? (() => undefined),
    onUpdateCursorSkin: props.onUpdateCursorSkin ?? (() => undefined),
    onUpdateCursorSampleSkinOverride: props.onUpdateCursorSampleSkinOverride ?? (() => undefined),
    onClearCursorSampleSkinOverride: props.onClearCursorSampleSkinOverride ?? (() => undefined),
    ...createInspectPanelEffectProps(props),
  };
}

function createInspectPanelEffectProps(props: WorkspaceSidebarSelectionBodyProps) {
  return {
    onUpdateCursorSampleInterpolation: props.onUpdateCursorSampleInterpolation ?? (() => undefined),
    onUpdateCursorSampleVisibility: props.onUpdateCursorSampleVisibility ?? (() => undefined),
    ...(props.onUpdateActionPresentation
      ? { onUpdateActionPresentation: props.onUpdateActionPresentation }
      : {}),
    onUpdateActionEventDetails: props.onUpdateActionEventDetails ?? (() => undefined),
    onDeleteMotionRegion: props.onDeleteMotionRegion ?? (() => undefined),
    onStartActionPointPlacement: props.onStartActionPointPlacement ?? (() => undefined),
    onStartMotionAreaPlacement: props.onStartMotionAreaPlacement ?? (() => undefined),
    onStartMotionFocusPlacement: props.onStartMotionFocusPlacement ?? (() => undefined),

    onStartObjectTrackAnchorPlacement: props.onStartObjectTrackAnchorPlacement ?? (() => undefined),
    onClearPlacementMode: props.onClearPlacementMode ?? (() => undefined),
    onUpdateMotionRegion: props.onUpdateMotionRegion ?? (() => undefined),
    onUpdateTransitionDuration: props.onUpdateTransitionDuration ?? (() => undefined),
    onUpdateTransitionEasing: props.onUpdateTransitionEasing ?? (() => undefined),
    onUpdateTransitionTemplate: props.onUpdateTransitionTemplate ?? (() => undefined),
    onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
    onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
    onMoveEffectInstance: props.onMoveEffectInstance ?? (() => undefined),
    onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
    onUpsertObjectTrackCorrectionAnchor:
      props.onUpsertObjectTrackCorrectionAnchor ?? (() => undefined),
  };
}
