import type React from 'react';
import type { VideoEditorLibrariesState } from '../../app-model/types';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorControllerStorePort as EditorStore } from '../../../contracts/controller-store';
import type { VideoEditorSidebarController } from '../contracts/sidebar';
import type { VideoEditorWorkspaceProjectUpdaters as ProjectUpdaters } from '../shared-actions';
import type { CreateVideoEditorWorkspaceArgs } from './types';
import { requestTrackDeletion } from './timeline-track-actions';
import { createWorkspaceSidebarPlacementActions } from './sidebar-placement-actions';

function createWorkspaceSidebarClipActions(store: EditorStore) {
  return {
    onApplyMediaClipVisualsToTrack: store.applyMediaClipVisualsToTrack,
    onConvertTextClipToAnnotation: store.convertTextClipToAnnotation,
    onDetachClipGroup: store.detachClipGroup,
    onUpdateAnnotationClipContent: store.updateAnnotationClipContent,
    onUpdateAnnotationClipStyle: store.updateAnnotationClipStyle,
    onUpdateAnnotationClipTemplate: store.updateAnnotationClipTemplate,
    onUpdateClipAudioEnvelope: store.updateClipAudioEnvelope,
    onUpdateClipFades: store.updateClipFades,
    onUpdateClipPlaybackRate: store.updateClipPlaybackRate,
    onUpdateClipMuted: store.updateClipMuted,
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
  actions: VideoEditorActionHandlers;
  projectUpdaters: ProjectUpdaters;
  store: EditorStore;
  workspace: VideoEditorWorkspaceState;
}) {
  return {
    ...createWorkspaceSidebarPlacementActions(args.store),
    ...createWorkspaceSidebarCursorActions(args),
    onAddActionEvent: args.projectUpdaters.addActionEvent,
    onAddMotionRegion: args.projectUpdaters.addMotionRegion,
    onAddRecording: args.actions.handleAddRecording,
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
    onRenameTrack: args.store.renameTrack,
    onResizeProject: args.projectUpdaters.resizeProject,
    ...createWorkspaceSidebarBackgroundActions(args),
    onToggleCollapsed: args.workspace.toggleSidebarCollapsed,
    onToggleDiagnostics: args.store.setDiagnosticsOpen,
    onUpdateActionEventDetails: args.projectUpdaters.updateActionEventDetails,
    onDeleteMotionRegion: args.projectUpdaters.deleteMotionRegion,
    onGenerateMotionPathFromCursor: args.projectUpdaters.generateMotionPathFromCursor,
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
  workspace: VideoEditorWorkspaceState;
}) {
  return {
    onSetSceneBackground: args.projectUpdaters.setSceneBackground,
    onPreviewSceneBackground: args.workspace.sceneBackgroundColors.setPreview,
    onRememberRecentColor: args.workspace.sceneBackgroundColors.rememberRecentColor,
    onResetSceneBackgroundPreview: args.workspace.sceneBackgroundColors.resetPreview,
  };
}

function createWorkspaceSidebarState(args: {
  diagnosticsContent: React.ReactNode;
  libraries: VideoEditorLibrariesState;
  project: NonNullable<EditorStore['project']>;
  selections: VideoEditorSelections;
  store: EditorStore;
  workspace: VideoEditorWorkspaceState;
}) {
  return {
    activeProjectId: args.project.id,
    collapsed: args.workspace.leftSidebarCollapsed,
    diagnosticsContent: args.diagnosticsContent,
    diagnosticsOpen: args.store.diagnosticsOpen,
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
    selectedActionEvent: args.selections.selectedActionEvent ?? null,
    selectedClip: args.selections.selectedClip,
    selectedCursorSample: args.selections.selectedCursorSample ?? null,
    selectedMotionRegion: args.selections.selectedMotionRegion ?? null,
    selectedTrack: args.selections.selectedTrack,
    selectedTransition: args.selections.selectedTransition ?? null,
  };
}

export function createWorkspaceSidebarController(
  args: CreateVideoEditorWorkspaceArgs,
  project: NonNullable<EditorStore['project']>,
  projectUpdaters: ProjectUpdaters
): VideoEditorSidebarController {
  return {
    clipActions: createWorkspaceSidebarClipActions(args.store),
    cursorDetection: args.cursorDetection,
    projectActions: createWorkspaceSidebarProjectActions({
      actions: args.actions,
      projectUpdaters,
      store: args.store,
      workspace: args.workspace,
    }),
    state: createWorkspaceSidebarState({
      diagnosticsContent: args.diagnosticsContent,
      libraries: args.libraries,
      project,
      selections: args.selections,
      store: args.store,
      workspace: args.workspace,
    }),
  };
}
