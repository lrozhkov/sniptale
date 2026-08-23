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
  | 'diagnosticsContent'
  | 'diagnosticsOpen'
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
    diagnosticsContent: controller.state.diagnosticsContent,
    diagnosticsOpen: controller.state.diagnosticsOpen,
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
  | 'onResizeProject'
  | 'onStartActionPointPlacement'
  | 'onStartMotionAreaPlacement'
  | 'onStartMotionFocusPlacement'
  | 'onStartObjectTrackAnchorPlacement'
  | 'onSetCursorCaptureMode'
> {
  return {
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
): Pick<
  WorkspaceSidebarProps,
  | 'onToggleCollapsed'
  | 'onToggleDiagnostics'
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
    onToggleDiagnostics: controller.projectActions.onToggleDiagnostics,
    onClearPlacementMode: controller.projectActions.onClearPlacementMode,
    onClearCursorSampleSkinOverride: controller.projectActions.onClearCursorSampleSkinOverride,
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
  | 'onUpdateAnnotationClipContent'
  | 'onUpdateAnnotationClipStyle'
  | 'onUpdateAnnotationClipTemplate'
  | 'onUpdateClipAudioEnvelope'
  | 'onUpdateClipFades'
  | 'onUpdateClipPlaybackRate'
  | 'onUpdateClipMuted'
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
    onUpdateAnnotationClipContent: actions.onUpdateAnnotationClipContent,
    onUpdateAnnotationClipStyle: actions.onUpdateAnnotationClipStyle,
    onUpdateAnnotationClipTemplate: actions.onUpdateAnnotationClipTemplate,
    onUpdateClipAudioEnvelope: actions.onUpdateClipAudioEnvelope,
    onUpdateClipFades: actions.onUpdateClipFades,
    onUpdateClipPlaybackRate: (clipId, playbackRate) =>
      actions.onUpdateClipPlaybackRate(clipId, playbackRate),
    onUpdateClipMuted: actions.onUpdateClipMuted,
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
  | 'selectedActionEvent'
  | 'selectedClip'
  | 'selectedCursorSample'
  | 'selectedMotionRegion'
  | 'selectedObjectTrack'
  | 'selectedTrack'
  | 'selectedTransition'
> {
  return {
    selectedActionEvent: controller.state.selectedActionEvent ?? null,
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
