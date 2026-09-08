import type {
  WorkspaceSidebarSelectionPanelProps,
  WorkspaceSidebarSelectionPanelSourceProps,
} from './contracts/selection-panel';

export function createSelectionPanelOptionalUpdateProps(
  props: WorkspaceSidebarSelectionPanelSourceProps
) {
  return {
    ...(props.onApplyCameraLayout ? { onApplyCameraLayout: props.onApplyCameraLayout } : {}),
    ...(props.onEditCameraPosition ? { onEditCameraPosition: props.onEditCameraPosition } : {}),
    ...(props.onApplyMediaClipVisualsToTrack
      ? { onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack }
      : {}),
    ...(props.onToggleUtilityLaneVisibility
      ? { onToggleUtilityLaneVisibility: props.onToggleUtilityLaneVisibility }
      : {}),
    ...(props.onToggleUtilityLaneLock
      ? { onToggleUtilityLaneLock: props.onToggleUtilityLaneLock }
      : {}),
    ...(props.onClearUtilityLane ? { onClearUtilityLane: props.onClearUtilityLane } : {}),
    ...(props.onRenameTrack ? { onRenameTrack: props.onRenameTrack } : {}),
    ...(props.onToggleTrackLock ? { onToggleTrackLock: props.onToggleTrackLock } : {}),
    ...(props.onToggleTrackVisibility
      ? { onToggleTrackVisibility: props.onToggleTrackVisibility }
      : {}),
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
  | 'onStartObjectTrackAnchorPlacement'
> {
  return {
    onClearPlacementMode: props.onClearPlacementMode ?? (() => undefined),
    onStartActionPointPlacement: props.onStartActionPointPlacement ?? (() => undefined),
    onStartMotionAreaPlacement: props.onStartMotionAreaPlacement ?? (() => undefined),
    onStartMotionFocusPlacement: props.onStartMotionFocusPlacement ?? (() => undefined),

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
  | 'onApplyTypingCompression'
  | 'onAddActionEvent'
  | 'onAddMotionRegion'
  | 'onDeleteActionEvent'
  | 'onDeleteCursorSample'
  | 'onDeleteMotionRegion'
  | 'onEnableCursorTrack'
  | 'onInsertCursorSample'
  | 'onUpdateActionPresentation'
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
    ...(props.onApplyTypingCompression
      ? { onApplyTypingCompression: props.onApplyTypingCompression }
      : {}),
    onAddActionEvent: props.onAddActionEvent ?? (() => undefined),
    onAddMotionRegion: props.onAddMotionRegion ?? (() => undefined),
    onDeleteActionEvent: props.onDeleteActionEvent ?? (() => undefined),
    onDeleteCursorSample: props.onDeleteCursorSample ?? (() => undefined),
    onDeleteMotionRegion: props.onDeleteMotionRegion ?? (() => undefined),
    onEnableCursorTrack: props.onEnableCursorTrack ?? (() => undefined),

    onInsertCursorSample: props.onInsertCursorSample ?? (() => undefined),
    ...(props.onUpdateActionPresentation
      ? { onUpdateActionPresentation: props.onUpdateActionPresentation }
      : {}),
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
