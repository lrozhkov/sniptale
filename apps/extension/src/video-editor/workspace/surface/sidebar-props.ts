import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { WorkspaceSidebarProps } from '../sidebar/contracts/props';

export function getWorkspaceSidebarProps(
  controller: VideoEditorWorkspaceController
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
  controller: VideoEditorWorkspaceController
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
  | 'cursorDetection'
> {
  return {
    activeProjectId: controller.sidebar.state.activeProjectId,
    collapsed: controller.sidebar.state.collapsed,
    diagnosticsContent: controller.sidebar.state.diagnosticsContent,
    diagnosticsOpen: controller.sidebar.state.diagnosticsOpen,
    gridSettings: controller.sidebar.state.gridSettings,
    inspectorMode: controller.sidebar.state.inspectorMode,
    recentColors: controller.sidebar.state.recentColors,
    project: controller.sidebar.state.project,
    placementMode: controller.sidebar.state.placementMode,
    cursorDetection: controller.sidebar.cursorDetection,
    projects: controller.sidebar.state.projects,
    recordingId: controller.sidebar.state.recordingId,
    recordings: controller.sidebar.state.recordings,
    selection: controller.sidebar.state.selection,
  };
}

function getWorkspaceSidebarProjectActionProps(
  controller: VideoEditorWorkspaceController
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
    onAddActionEvent: controller.sidebar.projectActions.onAddActionEvent,
    onAddMotionRegion: controller.sidebar.projectActions.onAddMotionRegion,
    onAddRecording: controller.sidebar.projectActions.onAddRecording,
    onAddTrack: controller.sidebar.projectActions.onAddTrack,
    onCreateProject: controller.sidebar.projectActions.onCreateProject,
    onDeleteTrack: controller.sidebar.projectActions.onDeleteTrack,
    onDeleteProject: controller.sidebar.projectActions.onDeleteProject,
    onEnableCursorTrack: controller.sidebar.projectActions.onEnableCursorTrack,
    onImportAudio: controller.sidebar.projectActions.onImportAudio,
    onImportImage: controller.sidebar.projectActions.onImportImage,
    onImportVideo: controller.sidebar.projectActions.onImportVideo,
    onOpenProject: controller.sidebar.projectActions.onOpenProject,
    onRenameTrack: controller.sidebar.projectActions.onRenameTrack,
    onResizeProject: controller.sidebar.projectActions.onResizeProject,
    onStartActionPointPlacement: controller.sidebar.projectActions.onStartActionPointPlacement,
    onStartMotionAreaPlacement: controller.sidebar.projectActions.onStartMotionAreaPlacement,
    onStartMotionFocusPlacement: controller.sidebar.projectActions.onStartMotionFocusPlacement,
    onStartObjectTrackAnchorPlacement:
      controller.sidebar.projectActions.onStartObjectTrackAnchorPlacement,
    onSetCursorCaptureMode: controller.sidebar.projectActions.onSetCursorCaptureMode,
  };
}

function getWorkspaceSidebarSceneBackgroundActionProps(
  controller: VideoEditorWorkspaceController
): Pick<
  WorkspaceSidebarProps,
  | 'onPreviewSceneBackground'
  | 'onRememberRecentColor'
  | 'onResetSceneBackgroundPreview'
  | 'onSetSceneBackground'
> {
  return {
    onPreviewSceneBackground: controller.sidebar.projectActions.onPreviewSceneBackground,
    onRememberRecentColor: controller.sidebar.projectActions.onRememberRecentColor,
    onResetSceneBackgroundPreview: controller.sidebar.projectActions.onResetSceneBackgroundPreview,
    onSetSceneBackground: controller.sidebar.projectActions.onSetSceneBackground,
  };
}

function getWorkspaceSidebarProjectEffectProps(
  controller: VideoEditorWorkspaceController
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
    onToggleCollapsed: controller.sidebar.projectActions.onToggleCollapsed,
    onToggleDiagnostics: controller.sidebar.projectActions.onToggleDiagnostics,
    onClearPlacementMode: controller.sidebar.projectActions.onClearPlacementMode,
    onClearCursorSampleSkinOverride:
      controller.sidebar.projectActions.onClearCursorSampleSkinOverride,
    onUpdateActionEventDetails: controller.sidebar.projectActions.onUpdateActionEventDetails,
    onUpdateCursorSampleInterpolation:
      controller.sidebar.projectActions.onUpdateCursorSampleInterpolation,
    onUpdateCursorSampleSkinOverride:
      controller.sidebar.projectActions.onUpdateCursorSampleSkinOverride,
    onUpdateCursorSampleVisibility:
      controller.sidebar.projectActions.onUpdateCursorSampleVisibility,
    onUpdateCursorSkin: controller.sidebar.projectActions.onUpdateCursorSkin,
    onUpdateMotionRegion: controller.sidebar.projectActions.onUpdateMotionRegion,
    onUpdateTransitionDuration: controller.sidebar.projectActions.onUpdateTransitionDuration,
    onUpdateTransitionEasing: controller.sidebar.projectActions.onUpdateTransitionEasing,
    onUpdateTransitionTemplate: controller.sidebar.projectActions.onUpdateTransitionTemplate,
    onDeleteEffectInstance: controller.sidebar.projectActions.onDeleteEffectInstance,
    onDuplicateEffectInstance: controller.sidebar.projectActions.onDuplicateEffectInstance,
    onMoveEffectInstance: controller.sidebar.projectActions.onMoveEffectInstance,
    onUpdateEffectInstance: controller.sidebar.projectActions.onUpdateEffectInstance,
  };
}

function getWorkspaceSidebarObjectTrackEffectProps(
  controller: VideoEditorWorkspaceController
): Pick<
  WorkspaceSidebarProps,
  'onDeleteObjectTrack' | 'onSelectObjectTrack' | 'onUpsertObjectTrackCorrectionAnchor'
> {
  return {
    onDeleteObjectTrack: controller.sidebar.projectActions.onDeleteObjectTrack,
    onSelectObjectTrack: controller.sidebar.projectActions.onSelectObjectTrack,
    onUpsertObjectTrackCorrectionAnchor:
      controller.sidebar.projectActions.onUpsertObjectTrackCorrectionAnchor,
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
  controller: VideoEditorWorkspaceController
): WorkspaceSidebarClipActionProps {
  const actions = controller.sidebar.clipActions;
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
  controller: VideoEditorWorkspaceController
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
    selectedActionEvent: controller.sidebar.state.selectedActionEvent ?? null,
    selectedClip: controller.sidebar.state.selectedClip,
    selectedCursorSample: controller.sidebar.state.selectedCursorSample ?? null,
    selectedMotionRegion: controller.sidebar.state.selectedMotionRegion ?? null,
    selectedObjectTrack: resolveSelectedObjectTrack(controller),
    selectedTrack: controller.sidebar.state.selectedTrack,
    selectedTransition: controller.sidebar.state.selectedTransition ?? null,
  };
}

function resolveSelectedObjectTrack(controller: VideoEditorWorkspaceController) {
  const { project, selection } = controller.sidebar.state;
  return selection.kind === VideoEditorSelectionKind.OBJECT_TRACK
    ? ((project.objectTracks ?? []).find((track) => track.id === selection.objectTrackId) ?? null)
    : null;
}
