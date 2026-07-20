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
    | 'project'
    | 'selection'
    | 'selectedClip'
    | 'selectedTransition'
    | 'selectedCursorSample'
    | 'selectedActionEvent'
    | 'selectedMotionRegion'
    | 'selectedObjectTrack'
    | 'selectedTrack'
    | 'cursorDetection'
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
    | 'onGenerateMotionPathFromCursor'
    | 'onInsertCursorSample'
    | 'onUpdateCursorSampleInterpolation'
    | 'onUpdateCursorSampleVisibility'
    | 'onUpdateActionEventDetails'
    | 'onUpdateAnnotationClipContent'
    | 'onUpdateAnnotationClipStyle'
    | 'onUpdateAnnotationClipTemplate'
    | 'onDeleteMotionRegion'
    | 'onStartActionPointPlacement'
    | 'onStartMotionAreaPlacement'
    | 'onStartMotionFocusPlacement'
    | 'onStartMotionPathStopAreaPlacement'
    | 'onStartMotionPathStopPointPlacement'
    | 'onStartObjectTrackAnchorPlacement'
    | 'onClearPlacementMode'
    | 'onUpdateMotionRegion'
    | 'onUpdateTransitionDuration'
    | 'onUpdateTransitionEasing'
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
    | 'onUpdateTextContent'
    | 'onUpdateTextStyle'
    | 'onUpdateSubtitleTrackStyle'
    | 'onUpdateShapeStyle'
    | 'onUpdateTransitionTemplate'
    | 'onDeleteEffectInstance'
    | 'onDuplicateEffectInstance'
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
    project: props.project,
    selection: props.selection ?? createSceneSelection(),
    selectedClip: props.selectedClip ?? null,
    selectedActionEvent: props.selectedActionEvent ?? null,
    selectedCursorSample: props.selectedCursorSample ?? null,
    selectedMotionRegion: props.selectedMotionRegion ?? null,
    selectedObjectTrack: props.selectedObjectTrack ?? null,
    selectedTrack: props.selectedTrack ?? null,
    selectedTransition: props.selectedTransition ?? null,
    placementMode: props.placementMode ?? null,
    cursorDetection: props.cursorDetection,
    recentColors: props.recentColors ?? [],
    ...createSelectionSceneClipUpdateDefaults(props),
    onUpdateMediaClipFitScalePercent: props.onUpdateMediaClipFitScalePercent,
    onUpdateMediaClipShadowIntensity: props.onUpdateMediaClipShadowIntensity,
    onUpdateMediaClipShadowMode: props.onUpdateMediaClipShadowMode,
    onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack,
    ...createSelectionAnnotationUpdateDefaults(props),
    onRenameTrack: props.onRenameTrack,
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
    onGenerateMotionPathFromCursor: props.onGenerateMotionPathFromCursor ?? (() => undefined),
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
    onUpdateActionEventDetails: props.onUpdateActionEventDetails ?? (() => undefined),
    onDeleteMotionRegion: props.onDeleteMotionRegion ?? (() => undefined),
    onStartActionPointPlacement: props.onStartActionPointPlacement ?? (() => undefined),
    onStartMotionAreaPlacement: props.onStartMotionAreaPlacement ?? (() => undefined),
    onStartMotionFocusPlacement: props.onStartMotionFocusPlacement ?? (() => undefined),
    onStartMotionPathStopAreaPlacement:
      props.onStartMotionPathStopAreaPlacement ?? (() => undefined),
    onStartMotionPathStopPointPlacement:
      props.onStartMotionPathStopPointPlacement ?? (() => undefined),
    onStartObjectTrackAnchorPlacement: props.onStartObjectTrackAnchorPlacement ?? (() => undefined),
    onClearPlacementMode: props.onClearPlacementMode ?? (() => undefined),
    onUpdateMotionRegion: props.onUpdateMotionRegion ?? (() => undefined),
    onUpdateTransitionDuration: props.onUpdateTransitionDuration ?? (() => undefined),
    onUpdateTransitionEasing: props.onUpdateTransitionEasing ?? (() => undefined),
    onUpdateTransitionTemplate: props.onUpdateTransitionTemplate ?? (() => undefined),
    onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
    onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
    onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
    onUpsertObjectTrackCorrectionAnchor:
      props.onUpsertObjectTrackCorrectionAnchor ?? (() => undefined),
  };
}
