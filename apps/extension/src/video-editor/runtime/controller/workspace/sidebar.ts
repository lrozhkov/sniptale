import {
  applyVideoProjectCameraLayout,
  type VideoProjectCameraLayout,
  type VideoProjectCameraPlacement,
} from '../../../../features/video/project/camera/placement';
import { canSplitProjectClipAtTime } from '../../../../features/video/project/timeline';
import type { VideoEditorLibrariesState } from '../../app-model/types';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type {
  AnnotationEditingPort,
  ClipSelectionPort,
  RecordingTelemetryPort,
  EffectEditingPort,
  ProjectLifecyclePort,
  PlaybackPort,
  RuntimeSessionPort,
  TimelineEditingPort,
} from '../../../contracts/controller-store';

type EditorStore = AnnotationEditingPort &
  ClipSelectionPort &
  RecordingTelemetryPort &
  EffectEditingPort &
  RuntimeSessionPort &
  TimelineEditingPort &
  Pick<ProjectLifecyclePort, 'project' | 'recordingId'> &
  Pick<PlaybackPort, 'currentTime'>;
type SidebarCommandHandlers = Pick<
  VideoEditorActionHandlers,
  | 'handleAddRecording'
  | 'handleAddLibraryMedia'
  | 'handleCreateProject'
  | 'handleDeleteProject'
  | 'handleImportAudio'
  | 'handleImportImage'
  | 'handleImportRecordedAudio'
  | 'handleImportVideo'
  | 'handleOpenProject'
>;
import type { VideoEditorSidebarController } from '../contracts/sidebar';
import type { VideoEditorWorkspaceProjectUpdaters as ProjectUpdaters } from '../shared-actions';
import { requestTrackDeletion } from './timeline-track-actions';
import { createWorkspaceSidebarPlacementActions } from './sidebar-placement-actions';

interface CreateWorkspaceSidebarArgs {
  actions: SidebarCommandHandlers;
  libraries: VideoEditorLibrariesState;
  selections: VideoEditorSelections;
  store: EditorStore;
  workspace: SidebarWorkspace;
}

type SidebarWorkspace = Pick<
  VideoEditorWorkspaceState,
  | 'confirm'
  | 'grid'
  | 'inspector'
  | 'leftSidebarCollapsed'
  | 'sceneBackgroundColors'
  | 'toggleSidebarCollapsed'
>;

function canSplitCameraInterval(
  project: NonNullable<EditorStore['project']>,
  clipId: string,
  time: number
) {
  const clip = project.clips.find((item) => item.id === clipId);
  return (
    clip?.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA') &&
    canSplitProjectClipAtTime(project, clipId, time)
  );
}

function createWorkspaceSidebarClipActions(store: EditorStore) {
  return {
    onApplyMediaClipVisualsToTrack: store.applyMediaClipVisualsToTrack,
    onConvertTextClipToAnnotation: store.convertTextClipToAnnotation,
    onDetachClipGroup: store.detachClipGroup,
    onSwapClip: store.swapClip,
    onTrimClipStart: store.trimClipStart,
    onTrimClipEnd: store.trimClipEnd,
    onUpdateAnnotationClipContent: store.updateAnnotationClipContent,
    onUpdateAnnotationClipStyle: store.updateAnnotationClipStyle,
    onUpdateAnnotationClipTemplate: store.updateAnnotationClipTemplate,
    onUpdateClipAudioEnvelope: store.updateClipAudioEnvelope,
    onUpdateClipFades: store.updateClipFades,
    onUpdateClipPlaybackRate: store.updateClipPlaybackRate,
    onUpdateClipMuted: store.updateClipMuted,
    onApplyCameraLayout: (
      clipId: string,
      layout: VideoProjectCameraLayout,
      placement?: VideoProjectCameraPlacement
    ) =>
      store.updateProject((project) =>
        applyVideoProjectCameraLayout(project, clipId, layout, placement)
      ),
    onSplitCameraInterval: (clipId: string) => {
      if (store.project && canSplitCameraInterval(store.project, clipId, store.currentTime)) {
        store.splitClipAt(clipId, store.currentTime);
      }
    },
    onUpdateClipTransform: store.updateClipTransform,
    onUpdateClipVolume: store.updateClipVolume,
    onUpdateMediaClipFitMode: store.updateMediaClipFitMode,
    onUpdateMediaClipFitScalePercent: store.updateMediaClipFitScalePercent,
    onUpdateMediaClipShadowIntensity: store.updateMediaClipShadowIntensity,
    onUpdateMediaClipShadowMode: store.updateMediaClipShadowMode,
    onUpdateShapeStyle: store.updateShapeClipStyle,
    onUpdateSubtitleTrackStyle: store.updateSubtitleTrackStyle,
    onUpdateTextContent: store.updateTextClipContent,
    onUpdateTextStyle: store.updateTextClipStyle,
  };
}

function createWorkspaceSidebarProjectActions(args: {
  actions: SidebarCommandHandlers;
  projectUpdaters: ProjectUpdaters;
  store: EditorStore;
  workspace: SidebarWorkspace;
}) {
  return {
    ...createWorkspaceSidebarPlacementActions(args.store),
    ...createWorkspaceSidebarCursorActions(args),
    onApplyTypingCompression: args.store.applyTypingCompression,
    onAddActionEvent: args.projectUpdaters.addActionEvent,
    onAddMotionRegion: args.projectUpdaters.addMotionRegion,
    onAddRecording: args.actions.handleAddRecording,
    onAddLibraryMedia: args.actions.handleAddLibraryMedia,
    onAddTrack: args.store.addTrack,
    onApplyEffectDocument: args.store.applyEffectDocument,
    onCreateProject: args.actions.handleCreateProject,
    onDeleteActionEvent: args.store.deleteActionEvent,
    onDeleteTrack: (trackId: string) => requestTrackDeletion(args.store, args.workspace, trackId),
    onDeleteObjectTrack: args.store.deleteObjectTrack,
    onSelectObjectTrack: args.store.selectObjectTrack,
    onDeleteProject: args.actions.handleDeleteProject,
    onImportAudio: args.actions.handleImportAudio,
    onImportImage: args.actions.handleImportImage,
    onImportRecordedAudio: args.actions.handleImportRecordedAudio,
    onImportVideo: args.actions.handleImportVideo,
    onOpenProject: args.actions.handleOpenProject,
    ...createWorkspaceSidebarTrackActions(args.store),
    onResizeProject: args.projectUpdaters.resizeProject,
    ...createWorkspaceSidebarBackgroundActions(args),
    onToggleCollapsed: args.workspace.toggleSidebarCollapsed,
    onUpdateActionPresentation: args.projectUpdaters.updateActionPresentation,
    onUpdateActionEventDetails: args.projectUpdaters.updateActionEventDetails,
    onDeleteMotionRegion: args.projectUpdaters.deleteMotionRegion,

    onUpdateMotionRegion: args.projectUpdaters.updateMotionRegion,
    onUpdateTransitionDuration: args.projectUpdaters.updateTransitionDuration,
    onUpdateTransitionEasing: args.projectUpdaters.updateTransitionEasing,
    onUpdateTransitionTemplate: args.projectUpdaters.updateTransitionTemplate,
    onDeleteEffectInstance: args.projectUpdaters.deleteEffectInstance,
    onDuplicateEffectInstance: args.projectUpdaters.duplicateEffectInstance,
    onMoveEffectInstance: args.projectUpdaters.moveEffectInstance,
    onUpdateEffectInstance: args.projectUpdaters.updateEffectInstance,
    onUpsertObjectTrackCorrectionAnchor: args.projectUpdaters.upsertObjectTrackCorrectionAnchor,
  };
}

export function createWorkspaceSidebarTrackActions(
  store: Pick<
    EditorStore,
    | 'renameTrack'
    | 'toggleTrackLock'
    | 'toggleTrackVisibility'
    | 'toggleUtilityLaneVisibility'
    | 'toggleUtilityLaneLock'
    | 'clearUtilityLane'
  >
) {
  return {
    onRenameTrack: store.renameTrack,
    onToggleTrackLock: store.toggleTrackLock,
    onToggleUtilityLaneVisibility: store.toggleUtilityLaneVisibility,
    onToggleUtilityLaneLock: store.toggleUtilityLaneLock,
    onClearUtilityLane: store.clearUtilityLane,
    onToggleTrackVisibility: store.toggleTrackVisibility,
  };
}

function createWorkspaceSidebarCursorActions(args: {
  projectUpdaters: ProjectUpdaters;
  store: EditorStore;
}) {
  return {
    onClearCursorSampleSkinOverride: args.store.clearCursorSampleSkinOverride,
    onDeleteCursorSample: args.store.deleteCursorSample,
    onEnableCursorTrack: args.projectUpdaters.enableCursorTrack,
    onInsertCursorSample: args.store.insertCursorSample,
    onSetCursorCaptureMode: args.projectUpdaters.setCursorCaptureMode,
    onUpdateCursorSampleInterpolation: args.projectUpdaters.updateCursorSampleInterpolation,
    onUpdateCursorSampleSkinOverride: args.projectUpdaters.updateCursorSampleSkinOverride,
    onUpdateCursorSampleVisibility: args.projectUpdaters.updateCursorSampleVisibility,
    onUpdateCursorSkin: args.projectUpdaters.updateCursorSkin,
  };
}

function createWorkspaceSidebarBackgroundActions(args: {
  projectUpdaters: ProjectUpdaters;
  workspace: Pick<SidebarWorkspace, 'sceneBackgroundColors'>;
}) {
  return {
    onSetSceneBackground: args.projectUpdaters.setSceneBackground,
    onPreviewSceneBackground: args.workspace.sceneBackgroundColors.setPreview,
    onRememberRecentColor: args.workspace.sceneBackgroundColors.rememberRecentColor,
    onResetSceneBackgroundPreview: args.workspace.sceneBackgroundColors.resetPreview,
  };
}

function createWorkspaceSidebarState(args: {
  libraries: VideoEditorLibrariesState;
  project: NonNullable<EditorStore['project']>;
  selections: VideoEditorSelections;
  store: EditorStore;
  workspace: SidebarWorkspace;
}) {
  return {
    activeProjectId: args.project.id,
    collapsed: args.workspace.leftSidebarCollapsed,
    gridSettings: {
      color: args.workspace.grid.gridColor,
      enabled: args.workspace.grid.gridEnabled,
      size: args.workspace.grid.gridSize,
      snapEnabled: args.workspace.grid.gridSnapEnabled,
      onSetColor: args.workspace.grid.setGridColor,
      onSetEnabled: args.workspace.grid.setGridEnabled,
      onSetSize: args.workspace.grid.setGridSize,
      onSetSnapEnabled: args.workspace.grid.setGridSnapEnabled,
    },
    inspectorMode: args.workspace.inspector.mode,
    project: args.project,
    placementMode: args.store.placementMode,
    projects: args.libraries.projects,
    recentColors: args.workspace.sceneBackgroundColors.recentColors,
    recordingId: args.store.recordingId,
    recordings: args.libraries.recordings,
    selection: args.selections.selection ?? { kind: 'scene' },
    ...(args.store.project ? { typingProject: args.store.project } : {}),
    recordingTelemetry: args.store.recordingTelemetry,
    currentTime: args.store.currentTime,
    selectedActionOccurrence: args.selections.selectedActionOccurrence ?? null,
    canSplitCameraInterval:
      !!args.selections.selectedClip &&
      canSplitCameraInterval(args.project, args.selections.selectedClip.id, args.store.currentTime),
    selectedClip: args.selections.selectedClip,
    selectedCursorSample: args.selections.selectedCursorSample ?? null,
    selectedMotionRegion: args.selections.selectedMotionRegion ?? null,
    selectedTrack: args.selections.selectedTrack,
    selectedTransition: args.selections.selectedTransition ?? null,
  };
}

export function createWorkspaceSidebarController(
  args: CreateWorkspaceSidebarArgs,
  project: NonNullable<EditorStore['project']>,
  projectUpdaters: ProjectUpdaters
): VideoEditorSidebarController {
  return {
    clipActions: createWorkspaceSidebarClipActions(args.store),
    projectActions: createWorkspaceSidebarProjectActions({
      actions: args.actions,
      projectUpdaters,
      store: args.store,
      workspace: args.workspace,
    }),
    state: createWorkspaceSidebarState({
      libraries: args.libraries,
      project,
      selections: args.selections,
      store: args.store,
      workspace: args.workspace,
    }),
  };
}
