import type { VideoEditorRuntimeController } from '../../session';
import type { SaveStateMeta, VideoEditorLibrariesState } from '../../app-model/types';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type {
  AnnotationEditingPort,
  ClipSelectionPort,
  DiagnosticsTelemetryPort,
  ExportPort,
  PlaybackPort,
  ProjectLifecyclePort,
  RuntimeSessionPort,
  TimelineEditingPort,
} from '../../../contracts/controller-store';

type HeaderStore = Pick<ExportPort, 'openExportDialog'> &
  Pick<ProjectLifecyclePort, 'renameProject'> &
  Pick<ClipSelectionPort, 'selectScene'>;

interface CreateWorkspaceHeaderArgs {
  libraries: Pick<VideoEditorLibrariesState, 'projectExports'>;
  saveStateMeta: SaveStateMeta;
  store: HeaderStore;
  workspace: Pick<
    VideoEditorWorkspaceState,
    | 'closeLibraryPanel'
    | 'grid'
    | 'inspector'
    | 'leftSidebarCollapsed'
    | 'libraryPanelOpen'
    | 'openAudioRecordingDialog'
    | 'openLibraryPanel'
    | 'toggleLibraryPanel'
    | 'toggleSidebarCollapsed'
  >;
}

type PreviewStore = AnnotationEditingPort &
  Pick<ClipSelectionPort, 'selectClip' | 'selectScene' | 'selectedClipId'> &
  Pick<PlaybackPort, 'currentTime' | 'isPlaying'> &
  RuntimeSessionPort &
  Pick<
    TimelineEditingPort,
    | 'addTrack'
    | 'updateActionEventDetails'
    | 'updateClipTransform'
    | 'updateMotionRegion'
    | 'upsertObjectTrackCorrectionAnchor'
  >;

interface CreateWorkspacePreviewArgs {
  actions: Pick<
    VideoEditorActionHandlers,
    'handleImportAudio' | 'handleImportImage' | 'handleImportVideo'
  >;
  selections: Pick<VideoEditorSelections, 'selectedActionEvent' | 'selectedMotionRegion'>;
  store: PreviewStore;
  workspace: Pick<VideoEditorWorkspaceState, 'grid' | 'inspector' | 'playbackRange' | 'preview'>;
}

export function createWorkspaceDiagnosticsController(
  store: Pick<DiagnosticsTelemetryPort, 'diagnosticsOpen' | 'setDiagnosticsOpen'> &
    Pick<ProjectLifecyclePort, 'recordingId'>
) {
  return {
    isOpen: store.diagnosticsOpen,
    onClose: () => store.setDiagnosticsOpen(false),
    recordingId: store.recordingId,
  };
}

function createHeaderGridController(workspace: Pick<VideoEditorWorkspaceState, 'grid'>) {
  return {
    magnetEnabled: workspace.grid.magnetEnabled,
    onToggleMagnet: workspace.grid.toggleMagnet,
  };
}

export function createWorkspaceHeaderController(
  args: CreateWorkspaceHeaderArgs,
  project: NonNullable<ProjectLifecyclePort['project']>
) {
  return {
    grid: createHeaderGridController(args.workspace),
    inspectorMode: args.workspace.inspector.mode,
    libraryPanelOpen: args.workspace.libraryPanelOpen,
    leftSidebarCollapsed: args.workspace.leftSidebarCollapsed,
    onOpenAudioRecordingDialog: args.workspace.openAudioRecordingDialog,
    onCloseLibraryPanel: args.workspace.closeLibraryPanel,
    onOpenExportDialog: args.store.openExportDialog,
    onOpenGridSettings: args.workspace.inspector.openGridSettings,
    onOpenLibraryPanel: args.workspace.openLibraryPanel,
    onRenameProject: args.store.renameProject,
    onSelectScene: () => {
      args.store.selectScene();
      args.workspace.inspector.openSelection();
    },
    onToggleLibraryPanel: args.workspace.toggleLibraryPanel,
    onToggleSidebar: args.workspace.toggleSidebarCollapsed,
    projectExportsCount: args.libraries.projectExports.length,
    projectMeta: {
      duration: project.duration,
      fps: project.fps,
      height: project.height,
      sourceKind: project.source.kind,
      width: project.width,
    },
    projectName: project.name,
    saveStateMeta: args.saveStateMeta,
  };
}

export function createWorkspaceLayoutController(
  workspace: Pick<
    VideoEditorWorkspaceState,
    | 'audioRecordingDialogOpen'
    | 'closeAudioRecordingDialog'
    | 'leftSidebarCollapsed'
    | 'openAudioRecordingDialog'
    | 'preview'
    | 'toggleSidebarCollapsed'
  >
) {
  return {
    audioRecordingDialogOpen: workspace.audioRecordingDialogOpen,
    closeAudioRecordingDialog: workspace.closeAudioRecordingDialog,
    handleStartVerticalResize: workspace.preview.handleStartVerticalResize,
    leftSidebarCollapsed: workspace.leftSidebarCollapsed,
    openAudioRecordingDialog: workspace.openAudioRecordingDialog,
    previewPaneHeight: workspace.preview.paneHeight,
    toggleSidebarCollapsed: workspace.toggleSidebarCollapsed,
    workspaceSplitRef: workspace.preview.workspaceSplitRef,
  };
}

function createWorkspacePreviewImports(args: CreateWorkspacePreviewArgs) {
  return {
    audio: args.actions.handleImportAudio,
    image: args.actions.handleImportImage,
    video: args.actions.handleImportVideo,
  };
}

function createWorkspacePreviewTransport(
  args: CreateWorkspacePreviewArgs,
  runtime: VideoEditorRuntimeController
) {
  return {
    currentTime: args.store.currentTime,
    isPlaying: args.store.isPlaying,
    onPausePlayback: runtime.pausePlayback,
    playbackRange: args.workspace.playbackRange,
    onSeek: runtime.seekTo,
    onTogglePlay: runtime.togglePlayback,
  };
}

function createWorkspacePreviewSelection(args: CreateWorkspacePreviewArgs) {
  return {
    placementMode: args.store.placementMode,
    selectedActionEvent: args.selections.selectedActionEvent,
    selectedClipId: args.store.selectedClipId,
    selectedMotionRegion: args.selections.selectedMotionRegion,
  };
}

function createWorkspacePreviewPreferences(workspace: Pick<VideoEditorWorkspaceState, 'preview'>) {
  const previewPreferences = workspace.preview.preferences;
  return {
    mode: previewPreferences.preferences.mode,
    onModeChange: (mode: typeof previewPreferences.preferences.mode) =>
      previewPreferences.updatePreferences({ mode }),
    onRasterPresetChange: (rasterPreset: typeof previewPreferences.preferences.rasterPreset) =>
      previewPreferences.updatePreferences({ rasterPreset }),
    onRetrySave: previewPreferences.retrySave,
    onZoomChange: (zoom: typeof previewPreferences.preferences.zoom) =>
      previewPreferences.updatePreferences({ zoom }),
    rasterPreset: previewPreferences.preferences.rasterPreset,
    saveFailed: previewPreferences.saveFailed,
    zoom: previewPreferences.preferences.zoom,
  };
}

function selectPreviewClip(args: CreateWorkspacePreviewArgs, clipId: string | null): void {
  args.store.selectClip(clipId);
  args.workspace.inspector.openSelection();
}

function selectPreviewScene(args: CreateWorkspacePreviewArgs): void {
  args.store.selectScene();
  args.workspace.inspector.openSelection();
}

export function createWorkspacePreviewController(
  args: CreateWorkspacePreviewArgs,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<ProjectLifecyclePort['project']>,
  projectUpdaters: {
    addActionEvent: (
      preset: NonNullable<
        NonNullable<ProjectLifecyclePort['project']>['actionEvents'][number]['preset']
      >
    ) => void;
    addMotionRegion: () => void;
    enableCursorTrack: () => void;
  }
) {
  return {
    assetUrls: runtime.assetUrls,
    grid: createWorkspacePreviewGrid(args),
    onImport: createWorkspacePreviewImports(args),
    editing: {
      onAddActionEvent: projectUpdaters.addActionEvent,
      onAddAnnotationOverlay: args.store.addAnnotationOverlay,
      onAddMotionRegion: projectUpdaters.addMotionRegion,
      onAddShapeOverlay: args.store.addShapeOverlay,
      onAddSubtitleOverlay: () => args.store.addSubtitleOverlay(),
      onAddTextOverlay: () => args.store.addTextOverlay(),
      onAddTrack: args.store.addTrack,
      onEnableCursorTrack: projectUpdaters.enableCursorTrack,
      onUpdateAnnotationClipTemplate: args.store.updateAnnotationClipTemplate,
      onUpdateClipTransform: args.store.updateClipTransform,
    },
    pointAuthoring: {
      onClearPlacementMode: args.store.clearPlacementMode,
      onUpdateActionEventDetails: args.store.updateActionEventDetails,
      onUpdateMotionRegion: args.store.updateMotionRegion,
      onUpsertObjectTrackCorrectionAnchor: args.store.upsertObjectTrackCorrectionAnchor,
    },
    preferences: createWorkspacePreviewPreferences(args.workspace),
    project,
    transport: {
      ...createWorkspacePreviewTransport(args, runtime),
      registerPreviewRuntime: runtime.registerPreviewRuntime,
    },
    selection: {
      ...createWorkspacePreviewSelection(args),
      onSelectClip: (clipId: string | null) => selectPreviewClip(args, clipId),
      onSelectScene: () => selectPreviewScene(args),
    },
  };
}

function createWorkspacePreviewGrid(args: CreateWorkspacePreviewArgs) {
  return {
    color: args.workspace.grid.gridColor,
    enabled: args.workspace.grid.gridEnabled,
    magnetEnabled: args.workspace.grid.magnetEnabled,
    size: args.workspace.grid.gridSize,
    snapEnabled: args.workspace.grid.gridSnapEnabled,
  };
}
