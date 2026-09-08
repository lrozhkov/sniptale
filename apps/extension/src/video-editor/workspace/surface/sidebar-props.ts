import type { VideoEditorSidebarController } from '../../runtime/controller/contracts/sidebar';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { WorkspaceSidebarProps } from '../sidebar/contracts/props';

export function getWorkspaceSidebarProps(
  controller: VideoEditorSidebarController
): WorkspaceSidebarProps {
  return {
    ...getWorkspaceSidebarStateProps(controller),
    ...getWorkspaceSidebarProjectActionProps(controller),
    ...getWorkspaceSidebarSceneBackgroundActionProps(controller),
    ...getWorkspaceSidebarProjectEffectProps(controller),
    ...getWorkspaceSidebarObjectTrackEffectProps(controller),
    ...getWorkspaceSidebarClipActionProps(controller),
    ...getWorkspaceSidebarSelectionProps(controller),
  };
}

function getWorkspaceSidebarStateProps(
  controller: VideoEditorSidebarController
): Pick<
  WorkspaceSidebarProps,
  | 'activeProjectId'
  | 'collapsed'
  | 'gridSettings'
  | 'inspectorMode'
  | 'recentColors'
  | 'project'
  | 'projects'
  | 'recordingId'
  | 'recordings'
  | 'selection'
  | 'placementMode'
> {
  return {
    activeProjectId: controller.state.activeProjectId,
    collapsed: controller.state.collapsed,
    gridSettings: controller.state.gridSettings,
    inspectorMode: controller.state.inspectorMode,
    recentColors: controller.state.recentColors,
    project: controller.state.project,
    placementMode: controller.state.placementMode,
    projects: controller.state.projects,
    recordingId: controller.state.recordingId,
    recordings: controller.state.recordings,
    selection: controller.state.selection,
  };
}

function getWorkspaceSidebarProjectActionProps(
  controller: VideoEditorSidebarController
): Pick<
  WorkspaceSidebarProps,
  | 'onApplyTypingCompression'
  | 'onAddActionEvent'
  | 'onAddMotionRegion'
  | 'onAddRecording'
  | 'onAddTrack'
  | 'onCreateProject'
  | 'onDeleteTrack'
  | 'onDeleteProject'
  | 'onEnableCursorTrack'
  | 'onImportAudio'
  | 'onImportImage'
  | 'onImportVideo'
  | 'onOpenProject'
  | 'onRenameTrack'
  | 'onToggleUtilityLaneVisibility'
  | 'onToggleUtilityLaneLock'
  | 'onClearUtilityLane'
  | 'onToggleTrackLock'
  | 'onToggleTrackVisibility'
  | 'onResizeProject'
  | 'onStartActionPointPlacement'
  | 'onStartMotionAreaPlacement'
  | 'onStartMotionFocusPlacement'
  | 'onStartObjectTrackAnchorPlacement'
  | 'onSetCursorCaptureMode'
> {
  return {
    ...(controller.projectActions.onApplyTypingCompression
      ? { onApplyTypingCompression: controller.projectActions.onApplyTypingCompression }
      : {}),
    onAddActionEvent: controller.projectActions.onAddActionEvent,
    onAddMotionRegion: controller.projectActions.onAddMotionRegion,
    onAddRecording: controller.projectActions.onAddRecording,
    onAddTrack: controller.projectActions.onAddTrack,
    onCreateProject: controller.projectActions.onCreateProject,
    onDeleteTrack: controller.projectActions.onDeleteTrack,
    onDeleteProject: controller.projectActions.onDeleteProject,
    onEnableCursorTrack: controller.projectActions.onEnableCursorTrack,
    onImportAudio: controller.projectActions.onImportAudio,
    onImportImage: controller.projectActions.onImportImage,
    onImportVideo: controller.projectActions.onImportVideo,
    onOpenProject: controller.projectActions.onOpenProject,
    onRenameTrack: controller.projectActions.onRenameTrack,
    onToggleUtilityLaneVisibility: controller.projectActions.onToggleUtilityLaneVisibility,
    onToggleUtilityLaneLock: controller.projectActions.onToggleUtilityLaneLock,
    onClearUtilityLane: controller.projectActions.onClearUtilityLane,
    onToggleTrackLock: controller.projectActions.onToggleTrackLock,
    onToggleTrackVisibility: controller.projectActions.onToggleTrackVisibility,
    onResizeProject: controller.projectActions.onResizeProject,
    onStartActionPointPlacement: controller.projectActions.onStartActionPointPlacement,
    onStartMotionAreaPlacement: controller.projectActions.onStartMotionAreaPlacement,
    onStartMotionFocusPlacement: controller.projectActions.onStartMotionFocusPlacement,
    onStartObjectTrackAnchorPlacement: controller.projectActions.onStartObjectTrackAnchorPlacement,
    onSetCursorCaptureMode: controller.projectActions.onSetCursorCaptureMode,
  };
}

function getWorkspaceSidebarSceneBackgroundActionProps(
  controller: VideoEditorSidebarController
): Pick<
  WorkspaceSidebarProps,
  | 'onPreviewSceneBackground'
  | 'onRememberRecentColor'
  | 'onResetSceneBackgroundPreview'
  | 'onSetSceneBackground'
> {
  return {
    onPreviewSceneBackground: controller.projectActions.onPreviewSceneBackground,
    onRememberRecentColor: controller.projectActions.onRememberRecentColor,
    onResetSceneBackgroundPreview: controller.projectActions.onResetSceneBackgroundPreview,
    onSetSceneBackground: controller.projectActions.onSetSceneBackground,
  };
}

function getWorkspaceSidebarProjectEffectProps(
  controller: VideoEditorSidebarController
): Required<Pick<WorkspaceSidebarProps, 'onUpdateActionPresentation'>> &
  Pick<
    WorkspaceSidebarProps,
    | 'onToggleCollapsed'
    | 'onUpdateActionEventDetails'
    | 'onUpdateCursorSampleInterpolation'
    | 'onUpdateCursorSampleSkinOverride'
    | 'onUpdateCursorSampleVisibility'
    | 'onClearCursorSampleSkinOverride'
    | 'onUpdateCursorSkin'
    | 'onClearPlacementMode'
    | 'onUpdateMotionRegion'
    | 'onUpdateTransitionDuration'
    | 'onUpdateTransitionEasing'
    | 'onUpdateTransitionTemplate'
    | 'onDeleteEffectInstance'
    | 'onDuplicateEffectInstance'
    | 'onMoveEffectInstance'
    | 'onUpdateEffectInstance'
  > {
  return {
    onToggleCollapsed: controller.projectActions.onToggleCollapsed,
    onClearPlacementMode: controller.projectActions.onClearPlacementMode,
    onClearCursorSampleSkinOverride: controller.projectActions.onClearCursorSampleSkinOverride,
    onUpdateActionPresentation: controller.projectActions.onUpdateActionPresentation,
    onUpdateActionEventDetails: controller.projectActions.onUpdateActionEventDetails,
    onUpdateCursorSampleInterpolation: controller.projectActions.onUpdateCursorSampleInterpolation,
    onUpdateCursorSampleSkinOverride: controller.projectActions.onUpdateCursorSampleSkinOverride,
    onUpdateCursorSampleVisibility: controller.projectActions.onUpdateCursorSampleVisibility,
    onUpdateCursorSkin: controller.projectActions.onUpdateCursorSkin,
    onUpdateMotionRegion: controller.projectActions.onUpdateMotionRegion,
    onUpdateTransitionDuration: controller.projectActions.onUpdateTransitionDuration,
    onUpdateTransitionEasing: controller.projectActions.onUpdateTransitionEasing,
    onUpdateTransitionTemplate: controller.projectActions.onUpdateTransitionTemplate,
    onDeleteEffectInstance: controller.projectActions.onDeleteEffectInstance,
    onDuplicateEffectInstance: controller.projectActions.onDuplicateEffectInstance,
    onMoveEffectInstance: controller.projectActions.onMoveEffectInstance,
    onUpdateEffectInstance: controller.projectActions.onUpdateEffectInstance,
  };
}

function getWorkspaceSidebarObjectTrackEffectProps(
  controller: VideoEditorSidebarController
): Pick<
  WorkspaceSidebarProps,
  'onDeleteObjectTrack' | 'onSelectObjectTrack' | 'onUpsertObjectTrackCorrectionAnchor'
> {
  return {
    onDeleteObjectTrack: controller.projectActions.onDeleteObjectTrack,
    onSelectObjectTrack: controller.projectActions.onSelectObjectTrack,
    onUpsertObjectTrackCorrectionAnchor:
      controller.projectActions.onUpsertObjectTrackCorrectionAnchor,
  };
}

type WorkspaceSidebarClipActionProps = Pick<
  WorkspaceSidebarProps,
  | 'onApplyMediaClipVisualsToTrack'
  | 'onConvertTextClipToAnnotation'
  | 'onDetachClipGroup'
  | 'onSwapClip'
  | 'onTrimClipStart'
  | 'onTrimClipEnd'
  | 'onUpdateAnnotationClipContent'
  | 'onUpdateAnnotationClipStyle'
  | 'onUpdateAnnotationClipTemplate'
  | 'onUpdateClipAudioEnvelope'
  | 'onUpdateClipFades'
  | 'onUpdateClipPlaybackRate'
  | 'onUpdateClipMuted'
  | 'onApplyCameraLayout'
  | 'onSplitCameraInterval'
  | 'onUpdateClipTransform'
  | 'onUpdateClipVolume'
  | 'onUpdateMediaClipFitMode'
  | 'onUpdateMediaClipFitScalePercent'
  | 'onUpdateMediaClipShadowIntensity'
  | 'onUpdateMediaClipShadowMode'
  | 'onUpdateShapeStyle'
  | 'onUpdateSubtitleTrackStyle'
  | 'onUpdateTextContent'
  | 'onUpdateTextStyle'
>;

function getWorkspaceSidebarClipActionProps(
  controller: VideoEditorSidebarController
): WorkspaceSidebarClipActionProps {
  const actions = controller.clipActions;
  return {
    onApplyMediaClipVisualsToTrack: actions.onApplyMediaClipVisualsToTrack,
    onConvertTextClipToAnnotation: actions.onConvertTextClipToAnnotation,
    onDetachClipGroup: actions.onDetachClipGroup,
    onSwapClip: actions.onSwapClip,
    onTrimClipStart: actions.onTrimClipStart,
    onTrimClipEnd: actions.onTrimClipEnd,
    onUpdateAnnotationClipContent: actions.onUpdateAnnotationClipContent,
    onUpdateAnnotationClipStyle: actions.onUpdateAnnotationClipStyle,
    onUpdateAnnotationClipTemplate: actions.onUpdateAnnotationClipTemplate,
    onUpdateClipAudioEnvelope: actions.onUpdateClipAudioEnvelope,
    onUpdateClipFades: actions.onUpdateClipFades,
    onUpdateClipPlaybackRate: (clipId, playbackRate) =>
      actions.onUpdateClipPlaybackRate(clipId, playbackRate),
    onUpdateClipMuted: actions.onUpdateClipMuted,
    ...(actions.onApplyCameraLayout ? { onApplyCameraLayout: actions.onApplyCameraLayout } : {}),
    ...(actions.onSplitCameraInterval
      ? { onSplitCameraInterval: actions.onSplitCameraInterval }
      : {}),
    onUpdateClipTransform: actions.onUpdateClipTransform,
    onUpdateClipVolume: actions.onUpdateClipVolume,
    onUpdateMediaClipFitMode: actions.onUpdateMediaClipFitMode,
    onUpdateMediaClipFitScalePercent: actions.onUpdateMediaClipFitScalePercent,
    onUpdateMediaClipShadowIntensity: actions.onUpdateMediaClipShadowIntensity,
    onUpdateMediaClipShadowMode: actions.onUpdateMediaClipShadowMode,
    onUpdateShapeStyle: actions.onUpdateShapeStyle,
    onUpdateSubtitleTrackStyle: (trackId, patch) =>
      actions.onUpdateSubtitleTrackStyle(trackId, patch),
    onUpdateTextContent: actions.onUpdateTextContent,
    onUpdateTextStyle: actions.onUpdateTextStyle,
  };
}

function getWorkspaceSidebarSelectionProps(
  controller: VideoEditorSidebarController
): Pick<
  WorkspaceSidebarProps,
  | 'typingProject'
  | 'recordingTelemetry'
  | 'currentTime'
  | 'selectedActionOccurrence'
  | 'canSplitCameraInterval'
  | 'selectedClip'
  | 'selectedCursorSample'
  | 'selectedMotionRegion'
  | 'selectedObjectTrack'
  | 'selectedTrack'
  | 'selectedTransition'
> {
  return {
    ...(controller.state.currentTime === undefined
      ? {}
      : { currentTime: controller.state.currentTime }),
    ...(controller.state.typingProject ? { typingProject: controller.state.typingProject } : {}),
    ...(controller.state.recordingTelemetry
      ? { recordingTelemetry: controller.state.recordingTelemetry }
      : {}),
    selectedActionOccurrence: controller.state.selectedActionOccurrence ?? null,
    canSplitCameraInterval: controller.state.canSplitCameraInterval ?? false,
    selectedClip: controller.state.selectedClip,
    selectedCursorSample: controller.state.selectedCursorSample ?? null,
    selectedMotionRegion: controller.state.selectedMotionRegion ?? null,
    selectedObjectTrack: resolveSelectedObjectTrack(controller),
    selectedTrack: controller.state.selectedTrack,
    selectedTransition: controller.state.selectedTransition ?? null,
  };
}

function resolveSelectedObjectTrack(controller: VideoEditorSidebarController) {
  const { project, selection } = controller.state;
  return selection.kind === VideoEditorSelectionKind.OBJECT_TRACK
    ? ((project.objectTracks ?? []).find((track) => track.id === selection.objectTrackId) ?? null)
    : null;
}
