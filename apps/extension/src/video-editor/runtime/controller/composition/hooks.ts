import { useContext, useMemo, type Context, type ReactNode } from 'react';
import { syncProjectSceneBackground } from '../../../../features/video/project/scene/background';
import { getSaveStateMeta } from '../../app-model/utils';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import { createSelectedClipActions } from '../selected-clip-actions';
import {
  createWorkspacePreviewProjectUpdaters,
  createWorkspaceProjectUpdaters,
} from '../shared-actions';
import {
  createVideoEditorCommandPaletteController,
  createVideoEditorHistoryController,
  createVideoEditorOverlaysController,
  createVideoEditorShellController,
} from '../shell';
import {
  getCurrentVideoEditorCurrentTime,
  useVideoEditorAnnotationEditingPort,
  useVideoEditorClipSelectionPort,
  useVideoEditorDiagnosticsTelemetryPort,
  useVideoEditorEffectEditingPort,
  useVideoEditorExportPort,
  useVideoEditorHistoryPort,
  useVideoEditorPlaybackPort,
  useVideoEditorProjectLifecyclePort,
  useVideoEditorRuntimeSessionPort,
  useVideoEditorTimelineEditingPort,
} from '../store';
import {
  createWorkspaceDiagnosticsController,
  createWorkspaceHeaderController,
  createWorkspaceLayoutController,
  createWorkspacePreviewController,
  createWorkspaceSidebarController,
  createWorkspaceTimelineController,
} from '../workspace';
import {
  AssetCommandContext,
  ExportCommandContext,
  ProjectCommandContext,
  RuntimePlaybackContext,
  RuntimePreviewContext,
  RuntimeProjectContext,
  VideoEditorBlockingOverlayContext,
  VideoEditorLibrariesContext,
  VideoEditorSelectionsContext,
  WorkspaceGridContext,
  WorkspaceInspectorContext,
  WorkspacePlaybackRangeContext,
  WorkspacePreviewContext,
  WorkspaceSceneBackgroundContext,
  WorkspaceDialogsContext,
  WorkspaceLayoutContext,
} from './contexts';

function useRequiredContext<Value>(context: Context<Value | null>, owner: string): Value {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${owner} must be used inside VideoEditorCompositionProvider.`);
  }
  return value;
}

export const useWorkspaceDialogsContext = () =>
  useRequiredContext(WorkspaceDialogsContext, 'Workspace dialogs context');
export const useWorkspaceLayoutContext = () =>
  useRequiredContext(WorkspaceLayoutContext, 'Workspace layout context');
export const useWorkspaceGridContext = () =>
  useRequiredContext(WorkspaceGridContext, 'Workspace grid context');
export const useWorkspaceInspectorContext = () =>
  useRequiredContext(WorkspaceInspectorContext, 'Workspace inspector context');
const useWorkspacePlaybackRangeContext = () =>
  useRequiredContext(WorkspacePlaybackRangeContext, 'Workspace playback-range context');
const useWorkspacePreviewContext = () =>
  useRequiredContext(WorkspacePreviewContext, 'Workspace preview context');
const useWorkspaceSceneBackgroundContext = () =>
  useRequiredContext(WorkspaceSceneBackgroundContext, 'Workspace scene-background context');
const useVideoEditorLibrariesContext = () =>
  useRequiredContext(VideoEditorLibrariesContext, 'Video editor libraries context');
export const useVideoEditorSelectionsContext = () =>
  useRequiredContext(VideoEditorSelectionsContext, 'Video editor selections context');
const useVideoEditorBlockingOverlayContext = () =>
  useRequiredContext(VideoEditorBlockingOverlayContext, 'Video editor blocking-overlay context');
const useRuntimePlaybackContext = () =>
  useRequiredContext(RuntimePlaybackContext, 'Runtime playback context');
const useRuntimePreviewContext = () =>
  useRequiredContext(RuntimePreviewContext, 'Runtime preview context');
const useRuntimeProjectContext = () =>
  useRequiredContext(RuntimeProjectContext, 'Runtime project context');
const useAssetCommandContext = () =>
  useRequiredContext(AssetCommandContext, 'Asset command context');
const useExportCommandContext = () =>
  useRequiredContext(ExportCommandContext, 'Export command context');
const useProjectCommandContext = () =>
  useRequiredContext(ProjectCommandContext, 'Project command context');

function useRuntimeControllerFromContexts(): VideoEditorRuntimeController {
  const playback = useRuntimePlaybackContext();
  const preview = useRuntimePreviewContext();
  const project = useRuntimeProjectContext();
  return useMemo(() => ({ ...playback, ...preview, ...project }), [playback, preview, project]);
}

function useSidebarCommandHandlers(): Pick<
  VideoEditorActionHandlers,
  | 'handleAddRecording'
  | 'handleCreateProject'
  | 'handleDeleteProject'
  | 'handleImportAudio'
  | 'handleImportImage'
  | 'handleImportRecordedAudio'
  | 'handleImportVideo'
  | 'handleOpenProject'
> {
  const assets = useAssetCommandContext();
  const project = useProjectCommandContext();
  return useMemo(() => ({ ...assets, ...project }), [assets, project]);
}

export function useVideoEditorShellController() {
  const store = useVideoEditorProjectLifecyclePort(({ error, isReady, project }) => ({
    error,
    isReady,
    project,
  }));
  return createVideoEditorShellController(store);
}

export function useVideoEditorOverlaysController() {
  const exportPort = useVideoEditorExportPort((port) => port);
  const project = useVideoEditorProjectLifecyclePort((port) => port.project);
  const selectedClipId = useVideoEditorClipSelectionPort((port) => port.selectedClipId);
  const workspace = useWorkspaceDialogsContext();
  const actions = useExportCommandContext();
  return createVideoEditorOverlaysController({
    actions,
    store: { ...exportPort, project, selectedClipId },
    workspace,
  });
}

export function useVideoEditorCommandPaletteController() {
  const diagnostics = useVideoEditorDiagnosticsTelemetryPort(
    ({ diagnosticsOpen, setDiagnosticsOpen }) => ({ diagnosticsOpen, setDiagnosticsOpen })
  );
  const playback = useVideoEditorPlaybackPort(({ currentTime, isPlaying }) => ({
    currentTime,
    isPlaying,
  }));
  const selection = useVideoEditorClipSelectionPort(({ selectedClipId }) => ({ selectedClipId }));
  const timeline = useVideoEditorTimelineEditingPort(
    ({ deleteClip, duplicateClip, splitClipAt }) => ({ deleteClip, duplicateClip, splitClipAt })
  );
  const annotation = useVideoEditorAnnotationEditingPort(({ addShapeOverlay, addTextOverlay }) => ({
    addShapeOverlay,
    addTextOverlay,
  }));
  const openExportDialog = useVideoEditorExportPort((port) => port.openExportDialog);
  const runtime = useRuntimePlaybackContext();
  const workspace = useWorkspaceLayoutContext();
  return createVideoEditorCommandPaletteController({
    runtime,
    store: {
      ...diagnostics,
      ...playback,
      ...selection,
      ...timeline,
      ...annotation,
      openExportDialog,
    },
    workspace,
  });
}

export function useVideoEditorHistoryController() {
  const history = useVideoEditorHistoryPort((port) => port);
  const blockingOverlayOpen = useVideoEditorBlockingOverlayContext();
  return createVideoEditorHistoryController(history, !blockingOverlayOpen);
}

export function useVideoEditorDiagnosticsController() {
  const diagnostics = useVideoEditorDiagnosticsTelemetryPort(
    ({ diagnosticsOpen, setDiagnosticsOpen }) => ({ diagnosticsOpen, setDiagnosticsOpen })
  );
  const recordingId = useVideoEditorProjectLifecyclePort((port) => port.recordingId);
  return createWorkspaceDiagnosticsController({ ...diagnostics, recordingId });
}

export function useVideoEditorLayoutController() {
  const dialogs = useWorkspaceDialogsContext();
  const layout = useWorkspaceLayoutContext();
  const preview = useWorkspacePreviewContext();
  const workspace = useMemo(() => ({ ...dialogs, ...layout, preview }), [dialogs, layout, preview]);
  return createWorkspaceLayoutController(workspace);
}

export function useVideoEditorHeaderController() {
  const lifecycle = useVideoEditorProjectLifecyclePort(({ project, renameProject, saveState }) => ({
    project,
    renameProject,
    saveState,
  }));
  const openExportDialog = useVideoEditorExportPort((port) => port.openExportDialog);
  const selectScene = useVideoEditorClipSelectionPort((port) => port.selectScene);
  const libraries = useVideoEditorLibrariesContext();
  const dialogs = useWorkspaceDialogsContext();
  const layout = useWorkspaceLayoutContext();
  const grid = useWorkspaceGridContext();
  const inspector = useWorkspaceInspectorContext();
  const workspace = useMemo(
    () => ({ ...dialogs, ...layout, grid, inspector }),
    [dialogs, grid, inspector, layout]
  );
  const saveStateMeta = useMemo(() => getSaveStateMeta(lifecycle.saveState), [lifecycle.saveState]);
  if (!lifecycle.project) return null;
  return createWorkspaceHeaderController(
    {
      libraries,
      saveStateMeta,
      store: { renameProject: lifecycle.renameProject, openExportDialog, selectScene },
      workspace,
    },
    lifecycle.project
  );
}

function usePresentedProject() {
  const project = useVideoEditorProjectLifecyclePort((port) => port.project);
  const sceneBackground = useWorkspaceSceneBackgroundContext();
  return useMemo(() => {
    if (!project || !sceneBackground.preview) return project;
    return {
      ...project,
      ...syncProjectSceneBackground(project, sceneBackground.preview),
    };
  }, [project, sceneBackground.preview]);
}

export function useVideoEditorPreviewController() {
  const project = usePresentedProject();
  const lifecycleProject = useVideoEditorProjectLifecyclePort((port) => port.project);
  const playback = useVideoEditorPlaybackPort((port) => port);
  const selection = useVideoEditorClipSelectionPort((port) => port);
  const annotation = useVideoEditorAnnotationEditingPort((port) => port);
  const session = useVideoEditorRuntimeSessionPort((port) => port);
  const timeline = useVideoEditorTimelineEditingPort((port) => port);
  const selections = useVideoEditorSelectionsContext();
  const runtime = useRuntimeControllerFromContexts();
  const assets = useAssetCommandContext();
  const grid = useWorkspaceGridContext();
  const inspector = useWorkspaceInspectorContext();
  const playbackRange = useWorkspacePlaybackRangeContext();
  const preview = useWorkspacePreviewContext();
  const workspace = useMemo(
    () => ({ ...playbackRange, grid, inspector, preview }),
    [grid, inspector, playbackRange, preview]
  );
  if (!project || !lifecycleProject) return null;
  const updaterStore = {
    project: lifecycleProject,
    getCurrentTime: getCurrentVideoEditorCurrentTime,
    selectMotionRegion: selection.selectMotionRegion,
    clearCursorSampleSkinOverride: timeline.clearCursorSampleSkinOverride,
    updateActionEventDetails: timeline.updateActionEventDetails,
    updateCursorSampleInterpolation: timeline.updateCursorSampleInterpolation,
    updateCursorSampleSkinOverride: timeline.updateCursorSampleSkinOverride,
    updateCursorSampleVisibility: timeline.updateCursorSampleVisibility,
    updateProject: timeline.updateProject,
  };
  const projectUpdaters = createWorkspacePreviewProjectUpdaters(updaterStore);
  return createWorkspacePreviewController(
    {
      actions: assets,
      selections,
      store: { ...annotation, ...selection, ...playback, ...session, ...timeline },
      workspace,
    },
    runtime,
    project,
    projectUpdaters
  );
}

export function useVideoEditorSidebarController(diagnosticsContent: ReactNode) {
  const project = usePresentedProject();
  const lifecycle = useVideoEditorProjectLifecyclePort(({ project, recordingId }) => ({
    project,
    recordingId,
  }));
  const annotation = useVideoEditorAnnotationEditingPort((port) => port);
  const selection = useVideoEditorClipSelectionPort((port) => port);
  const diagnostics = useVideoEditorDiagnosticsTelemetryPort((port) => port);
  const effects = useVideoEditorEffectEditingPort((port) => port);
  const session = useVideoEditorRuntimeSessionPort((port) => port);
  const timeline = useVideoEditorTimelineEditingPort((port) => port);
  const libraries = useVideoEditorLibrariesContext();
  const selections = useVideoEditorSelectionsContext();
  const dialogs = useWorkspaceDialogsContext();
  const layout = useWorkspaceLayoutContext();
  const grid = useWorkspaceGridContext();
  const inspector = useWorkspaceInspectorContext();
  const sceneBackgroundColors = useWorkspaceSceneBackgroundContext();
  const workspace = useMemo(
    () => ({ ...dialogs, ...layout, grid, inspector, sceneBackgroundColors }),
    [dialogs, grid, inspector, layout, sceneBackgroundColors]
  );
  const actions = useSidebarCommandHandlers();
  if (!project || !lifecycle.project) return null;
  const store = {
    ...annotation,
    ...selection,
    ...diagnostics,
    ...effects,
    ...session,
    ...timeline,
    ...lifecycle,
  };
  const projectUpdaters = createWorkspaceProjectUpdaters({
    ...store,
    getCurrentTime: getCurrentVideoEditorCurrentTime,
  });
  return createWorkspaceSidebarController(
    { actions, diagnosticsContent, libraries, selections, store, workspace },
    project,
    projectUpdaters
  );
}

export function useVideoEditorTimelineController() {
  const lifecycle = useVideoEditorProjectLifecyclePort((port) => port.project);
  const playback = useVideoEditorPlaybackPort((port) => port);
  const selection = useVideoEditorClipSelectionPort((port) => port);
  const diagnostics = useVideoEditorDiagnosticsTelemetryPort(
    ({ recordingTelemetry, telemetryLaneVisible, toggleTelemetryLaneVisibility }) => ({
      recordingTelemetry,
      telemetryLaneVisible,
      toggleTelemetryLaneVisibility,
    })
  );
  const annotation = useVideoEditorAnnotationEditingPort((port) => port);
  const effects = useVideoEditorEffectEditingPort((port) => port);
  const history = useVideoEditorHistoryPort((port) => port);
  const timeline = useVideoEditorTimelineEditingPort((port) => port);
  const setError = useVideoEditorProjectLifecyclePort((port) => port.setError);
  const runtime = useRuntimeControllerFromContexts();
  const dialogs = useWorkspaceDialogsContext();
  const grid = useWorkspaceGridContext();
  const inspector = useWorkspaceInspectorContext();
  const playbackRange = useWorkspacePlaybackRangeContext();
  const workspace = useMemo(
    () => ({ ...playbackRange, confirm: dialogs.confirm, grid, inspector }),
    [dialogs.confirm, grid, inspector, playbackRange]
  );
  const assets = useAssetCommandContext();
  if (!lifecycle) return null;
  const store = {
    ...playback,
    ...annotation,
    ...selection,
    ...diagnostics,
    ...effects,
    ...history,
    ...timeline,
    project: lifecycle,
    setError,
  };
  const projectUpdaters = createWorkspaceProjectUpdaters({
    ...store,
    getCurrentTime: getCurrentVideoEditorCurrentTime,
  });
  const selectedClipActions = createSelectedClipActions(store);
  return createWorkspaceTimelineController(
    store,
    runtime,
    lifecycle,
    assets,
    workspace,
    projectUpdaters,
    selectedClipActions
  );
}
