import type {
  WorkspaceSidebarSelectionPanelProps,
  WorkspaceSidebarSelectionPanelSourceProps,
} from './contracts/selection-panel';

export function createSelectionPanelOptionalUpdateProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
) {
  return {
    ...(props.onApplyMediaClipVisualsToTrack
      ? { onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack }
      : {}),
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
  };
}

export function createSelectionPanelOptionalPlacementProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'onClearPlacementMode'
  | 'onStartActionPointPlacement'
  | 'onStartMotionAreaPlacement'
  | 'onStartMotionFocusPlacement'
  | 'onStartMotionPathStopAreaPlacement'
  | 'onStartMotionPathStopPointPlacement'
  | 'onStartObjectTrackAnchorPlacement'
> {
  return {
    onClearPlacementMode: props.onClearPlacementMode ?? (() => undefined),
    onStartActionPointPlacement: props.onStartActionPointPlacement ?? (() => undefined),
    onStartMotionAreaPlacement: props.onStartMotionAreaPlacement ?? (() => undefined),
    onStartMotionFocusPlacement: props.onStartMotionFocusPlacement ?? (() => undefined),
    onStartMotionPathStopAreaPlacement:
      props.onStartMotionPathStopAreaPlacement ?? (() => undefined),
    onStartMotionPathStopPointPlacement:
      props.onStartMotionPathStopPointPlacement ?? (() => undefined),
    onStartObjectTrackAnchorPlacement: props.onStartObjectTrackAnchorPlacement ?? (() => undefined),
  };
}

export function createSelectionPanelEffectInstanceProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'onDeleteEffectInstance'
  | 'onDuplicateEffectInstance'
  | 'onMoveEffectInstance'
  | 'onUpdateEffectInstance'
> {
  return {
    onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
    onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
    onMoveEffectInstance: props.onMoveEffectInstance ?? (() => undefined),
    onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
  };
}

export function createSelectionPanelOptionalProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
): Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'cursorDetection'
  | 'onAddActionEvent'
  | 'onAddMotionRegion'
  | 'onDeleteActionEvent'
  | 'onDeleteCursorSample'
  | 'onDeleteMotionRegion'
  | 'onEnableCursorTrack'
  | 'onGenerateMotionPathFromCursor'
  | 'onInsertCursorSample'
  | 'onUpdateActionEventDetails'
  | 'onUpdateCursorSampleInterpolation'
  | 'onUpdateCursorSampleVisibility'
  | 'onUpdateMotionRegion'
  | 'onUpdateTransitionDuration'
  | 'onUpdateTransitionEasing'
  | 'onUpsertObjectTrackCorrectionAnchor'
> &
  Partial<Pick<WorkspaceSidebarSelectionPanelProps, 'onDeleteTrack'>> {
  return {
    cursorDetection: props.cursorDetection,
    onAddActionEvent: props.onAddActionEvent ?? (() => undefined),
    onAddMotionRegion: props.onAddMotionRegion ?? (() => undefined),
    onDeleteActionEvent: props.onDeleteActionEvent ?? (() => undefined),
    onDeleteCursorSample: props.onDeleteCursorSample ?? (() => undefined),
    onDeleteMotionRegion: props.onDeleteMotionRegion ?? (() => undefined),
    onEnableCursorTrack: props.onEnableCursorTrack ?? (() => undefined),
    onGenerateMotionPathFromCursor: props.onGenerateMotionPathFromCursor ?? (() => undefined),
    onInsertCursorSample: props.onInsertCursorSample ?? (() => undefined),
    onUpdateActionEventDetails: props.onUpdateActionEventDetails ?? (() => undefined),
    onUpdateCursorSampleInterpolation: props.onUpdateCursorSampleInterpolation ?? (() => undefined),
    onUpdateCursorSampleVisibility: props.onUpdateCursorSampleVisibility ?? (() => undefined),
    onUpdateMotionRegion: props.onUpdateMotionRegion ?? (() => undefined),
    onUpdateTransitionDuration: props.onUpdateTransitionDuration ?? (() => undefined),
    onUpdateTransitionEasing: props.onUpdateTransitionEasing ?? (() => undefined),
    onUpsertObjectTrackCorrectionAnchor:
      props.onUpsertObjectTrackCorrectionAnchor ?? (() => undefined),
    ...(props.onDeleteTrack ? { onDeleteTrack: props.onDeleteTrack } : {}),
  };
}
