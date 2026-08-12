import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoExportFormat, VideoExportQualityPreset } from '../../../features/video/project/types';
import { createSceneSelection } from '../../project/selection/model';
import type { VideoEditorState } from '../../state/store';
import type { VideoEditorWorkspaceState } from './workspace-state';
import { useVideoEditorController } from './index';
import { createHookStoreActions, createWorkspaceHookPreviewState } from './index.test-support';
const useVideoEditorStoreMock = vi.fn();
const useVideoEditorLibrariesMock = vi.fn();
const useVideoEditorWorkspaceStateMock = vi.fn();
const useVideoEditorRuntimeMock = vi.fn();
const useVideoEditorActionHandlersMock = vi.fn();
const useVideoEditorSelectionsMock = vi.fn();
const useVideoEditorOverlayPlaybackMock = vi.fn();
const getSaveStateMetaMock = vi.fn();
const useVideoEditorProjectHistoryShortcutsMock = vi.fn();
const baseProject = { ...createEmptyVideoProject('Hook Test') };
vi.mock('../../state/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/store')>()),
  useVideoEditorStore: (selector?: (state: VideoEditorState) => unknown) =>
    useVideoEditorStoreMock(selector),
}));
vi.mock('./libraries', () => ({
  useVideoEditorLibraries: () => useVideoEditorLibrariesMock(),
}));
vi.mock('./workspace-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workspace-state')>()),
  useVideoEditorWorkspaceState: () => useVideoEditorWorkspaceStateMock(),
}));
vi.mock('./overlay-playback', () => ({
  useVideoEditorOverlayPlayback: (params: unknown) => useVideoEditorOverlayPlaybackMock(params),
}));
vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  useVideoEditorRuntime: (params: unknown) => useVideoEditorRuntimeMock(params),
}));
vi.mock('../commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../commands')>()),
  useVideoEditorActionHandlers: (params: unknown, confirmHandlers: unknown) =>
    useVideoEditorActionHandlersMock(params, confirmHandlers),
}));
vi.mock('./selections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./selections')>()),
  useVideoEditorSelections: (...args: unknown[]) => useVideoEditorSelectionsMock(...args),
}));
vi.mock('../app-model/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app-model/utils')>()),
  getSaveStateMeta: (...args: unknown[]) => getSaveStateMetaMock(...args),
}));
vi.mock('../session/history-shortcuts', () => ({
  useVideoEditorProjectHistoryShortcuts: (params: unknown) =>
    useVideoEditorProjectHistoryShortcutsMock(params),
}));

function createStoreState(): VideoEditorState {
  return {
    project: {
      ...baseProject,
      clips: [],
      tracks: baseProject.tracks,
    },
    projectHistory: {
      projectId: baseProject.id,
      past: [],
      future: [],
      error: null,
      transaction: null,
    },
    recordingId: 'recording-1',
    isReady: true,
    error: null,
    saveState: 'saved',
    currentTime: 6,
    isPlaying: false,
    pixelsPerSecond: 90,
    placementMode: null,
    selection: createSceneSelection(),
    selectedTrackId: baseProject.tracks[0]?.id ?? null,
    selectedClipId: null,
    diagnosticsOpen: true,
    recordingTelemetry: null,
    telemetryLaneVisible: false,
    exportState: {
      dialogOpen: true,
      error: null,
      isRunning: false,
      jobId: null,
      lastResult: null,
      settings: {
        width: 1280,
        height: 720,
        fps: 30,
        format: VideoExportFormat.MP4,
        resolution: 'SOURCE' as const,
        mp4VideoCodec: 'AVC' as const,
        quality: VideoExportQualityPreset.MEDIUM,
        downloadAfterExport: true,
      },
      status: null,
    },
    ...createHookStoreActions(),
  };
}

function createWorkspaceHookState() {
  return {
    ...createWorkspaceHookShellState(),
    ...createWorkspaceHookActions(),
  };
}

function createWorkspaceHookShellState() {
  return {
    confirm: {
      dialog: null,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      request: vi.fn(),
    },
    audioRecordingDialogOpen: false,
    libraryPanelOpen: false,
    leftSidebarCollapsed: false,
    inspector: {
      mode: 'selection' as const,
      openGridSettings: vi.fn(),
      openSelection: vi.fn(),
    },
    grid: {
      gridColor: '#94a3b8',
      gridEnabled: false,
      gridPopoverOpen: false,
      gridSize: 80,
      gridSnapEnabled: true,
      magnetEnabled: true,
      workspacePopoverOpen: false,
      closeGridPopover: vi.fn(),
      closeWorkspacePopover: vi.fn(),
      setGridColor: vi.fn(),
      setGridEnabled: vi.fn(),
      setGridSize: vi.fn(),
      setGridSnapEnabled: vi.fn(),
      toggleGridPopover: vi.fn(),
      toggleMagnet: vi.fn(),
      toggleWorkspacePopover: vi.fn(),
    },
    playbackRange: null,
    preview: createWorkspaceHookPreviewState(),
    sceneBackgroundColors: {
      preview: null,
      recentColors: [],
      rememberRecentColor: vi.fn(async () => undefined),
      resetPreview: vi.fn(),
      setPreview: vi.fn(),
    },
  };
}

function createWorkspaceHookActions() {
  return {
    clearPlaybackRange: vi.fn(),
    closeAudioRecordingDialog: vi.fn(),
    closeLibraryPanel: vi.fn(),
    openAudioRecordingDialog: vi.fn(),
    openLibraryPanel: vi.fn(),
    setPlaybackRange: vi.fn(),
    toggleLibraryPanel: vi.fn(),
    toggleSidebarCollapsed: vi.fn(),
  };
}

function createActionHandlerMocks() {
  return {
    handleAddRecording: vi.fn(),
    handleCreateProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handleImportAudio: vi.fn(),
    handleImportImage: vi.fn(),
    handleImportRecordedAudio: vi.fn(),
    handleImportVideo: vi.fn(),
    handleOpenProject: vi.fn(),
    handleStartExport: vi.fn(),
    handleCancelExport: vi.fn(),
  };
}

function prepareHookMocks(
  store: VideoEditorState,
  workspaceState: VideoEditorWorkspaceState = createWorkspaceHookState()
) {
  useVideoEditorStoreMock.mockImplementation(
    (selector?: (state: VideoEditorState) => unknown) => selector?.(store) ?? store
  );
  useVideoEditorLibrariesMock.mockReturnValue({
    projectExports: [{ id: 'export-1' }],
    projects: store.project
      ? [{ id: store.project.id, name: 'Hook Test', createdAt: 1, updatedAt: 2 }]
      : [],
    recordings: [],
  });
  useVideoEditorWorkspaceStateMock.mockReturnValue(workspaceState);
  useVideoEditorRuntimeMock.mockReturnValue({
    assetUrls: { asset: 'blob:asset' },
    timelinePreviews: {},
    registerPreviewRuntime: vi.fn(),
    seekTo: vi.fn(),
    setTimelinePreviewSuspended: vi.fn(),
    setTimelinePreviewViewport: vi.fn(),
    setPlaybackPlaying: vi.fn(),
    togglePlayback: vi.fn(),
    applyLoadedProject: vi.fn(),
  });
  useVideoEditorActionHandlersMock.mockReturnValue(createActionHandlerMocks());
  useVideoEditorSelectionsMock.mockReturnValue({
    selection: createSceneSelection(),
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: store.project?.tracks[0] ?? null,
    selectedTransition: null,
  });
  getSaveStateMetaMock.mockReturnValue({
    label: 'Saved',
    tone: 'success',
  });
}

function verifyControllerAssembly() {
  const store = createStoreState();
  const result: { current: ReturnType<typeof useVideoEditorController> | null } = { current: null };
  prepareHookMocks(store);
  function Harness(): React.JSX.Element {
    result.current = useVideoEditorController();
    return <div data-testid="controller" />;
  }
  renderToStaticMarkup(<Harness />);

  expect(result.current?.shell.project?.name).toBe('Hook Test');
  expect(result.current?.workspace?.header.projectExportsCount).toBe(1);
  expect(result.current?.workspace?.preview.assetUrls['asset']).toBe('blob:asset');
  expect(result.current?.overlays.exportDialog.isOpen).toBe(true);
  expect(result.current?.palette.leftSidebarCollapsed).toBe(false);
  expect(useVideoEditorOverlayPlaybackMock).toHaveBeenCalledWith({
    blockingOverlayOpen: true,
    enabled: true,
    isPlaying: false,
    setPlaybackPlaying: expect.any(Function),
  });
}
function verifyControllerWithoutActiveProject() {
  const store = createStoreState();
  const result: { current: ReturnType<typeof useVideoEditorController> | null } = { current: null };
  store.project = null;
  store.recordingId = null;
  store.isReady = false;
  store.selectedTrackId = null;
  prepareHookMocks(store);
  function Harness(): React.JSX.Element {
    result.current = useVideoEditorController();
    return <div data-testid="controller" />;
  }
  expect(() => renderToStaticMarkup(<Harness />)).not.toThrow();
  expect(result.current?.shell.project).toBeNull();
  expect(result.current?.workspace).toBeNull();
}

describe('useVideoEditorController', () => {
  afterEach(() => vi.clearAllMocks());
  it('assembles shell, workspace, overlays, and palette slices', verifyControllerAssembly);
  it(
    'keeps shell state available while the active project is still loading',
    verifyControllerWithoutActiveProject
  );

  it('blocks history shortcuts and commands while confirmation is open', () => {
    const store = createStoreState();
    store.exportState.dialogOpen = false;
    store.projectHistory.past = [structuredClone(store.project!)];
    const baseWorkspaceState = createWorkspaceHookState();
    const workspaceState = {
      ...baseWorkspaceState,
      confirm: {
        ...baseWorkspaceState.confirm,
        dialog: {
          title: 'Discard changes?',
          message: 'Body',
          confirmText: 'Discard',
          cancelText: 'Keep',
        },
      },
    };
    const result: { current: ReturnType<typeof useVideoEditorController> | null } = {
      current: null,
    };
    prepareHookMocks(store, workspaceState);

    function Harness(): React.JSX.Element {
      result.current = useVideoEditorController();
      return <button type="button">Confirm</button>;
    }

    renderToStaticMarkup(<Harness />);

    expect(useVideoEditorProjectHistoryShortcutsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
    expect(result.current?.workspace?.history).toMatchObject({ canUndo: false, canRedo: false });
    result.current?.workspace?.history.onUndo();
    result.current?.workspace?.history.onRedo();
    expect(store.undoProject).not.toHaveBeenCalled();
    expect(store.redoProject).not.toHaveBeenCalled();
  });

  it('blocks history shortcuts and commands while export failure is open', () => {
    const store = createStoreState();
    store.exportState.dialogOpen = false;
    store.exportState.error = 'Export failed';
    store.projectHistory.past = [structuredClone(store.project!)];
    const result: { current: ReturnType<typeof useVideoEditorController> | null } = {
      current: null,
    };
    prepareHookMocks(store);

    function Harness(): React.JSX.Element {
      result.current = useVideoEditorController();
      return <div data-testid="controller" />;
    }

    renderToStaticMarkup(<Harness />);

    expect(useVideoEditorProjectHistoryShortcutsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
    expect(result.current?.workspace?.history).toMatchObject({ canUndo: false, canRedo: false });
    result.current?.workspace?.history.onUndo();
    expect(store.undoProject).not.toHaveBeenCalled();
  });

  it('passes active history transactions to editor-wide shortcut state', () => {
    const store = createStoreState();
    store.projectHistory.transaction = {
      before: structuredClone(store.project!),
      changed: true,
      lease: Symbol('active-history-transaction'),
      projectId: store.project!.id,
    };
    prepareHookMocks(store);

    function Harness(): React.JSX.Element {
      useVideoEditorController();
      return <div data-testid="controller" />;
    }

    renderToStaticMarkup(<Harness />);

    expect(useVideoEditorRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        playback: expect.objectContaining({ projectHistoryTransactionActive: true }),
      })
    );
  });

  it('returns the inspector to selection mode when manual modes are followed by selections', () => {
    const store = createStoreState();
    const workspaceState = createWorkspaceHookState();
    const result: { current: ReturnType<typeof useVideoEditorController> | null } = {
      current: null,
    };
    prepareHookMocks(store, workspaceState);

    function Harness(): React.JSX.Element {
      result.current = useVideoEditorController();
      return <div data-testid="controller" />;
    }

    renderToStaticMarkup(<Harness />);
    result.current?.workspace?.header.onOpenGridSettings();
    result.current?.workspace?.preview.selection.onSelectClip('clip-1');
    result.current?.workspace?.timeline.actions.onSelectTrack('track-1');

    expect(workspaceState.inspector.openGridSettings).toHaveBeenCalledTimes(1);
    expect(store.selectClip).toHaveBeenCalledWith('clip-1');
    expect(store.selectTrack).toHaveBeenCalledWith('track-1');
    expect(workspaceState.inspector.openSelection).toHaveBeenCalledTimes(2);
  });
});
