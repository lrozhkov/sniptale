// @vitest-environment jsdom

import { act, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fn = vi.fn;
  const action = fn();
  const lifecycle = {
    error: null,
    isReady: false,
    project: null,
    recordingId: null,
    renameProject: action,
    saveState: 'saved',
    setError: action,
    setProject: action,
    setReady: action,
    setSaveState: action,
    syncProjectRevision: action,
  };
  const playback = {
    currentTime: 0,
    isPlaying: false,
    setCurrentTime: action,
    setPlaying: action,
    togglePlaying: action,
  };
  const selection = {
    selection: { kind: 'scene' },
    selectedClipId: null,
    selectedTrackId: null,
  };
  const timeline = new Proxy(
    { pixelsPerSecond: 100 },
    { get: (target, property) => Reflect.get(target, property) ?? action }
  );
  const history = {
    projectHistoryStatus: { canRedo: false, canUndo: false, error: null },
    projectHistoryTransactionActive: false,
    redoProject: action,
    undoProject: action,
  };
  const exportPort = {
    cancelExport: action,
    completeExport: action,
    exportState: { dialogOpen: false, error: null, isRunning: false },
    failExport: action,
    failExportCancellation: action,
    startExport: action,
    updateExportStatus: action,
  };
  const session = { clearPlacementMode: action, placementMode: null };
  const telemetry = {
    setDiagnosticsOpen: action,
    setRecordingTelemetry: action,
  };
  const libraries = {
    projectExports: [],
    projects: [],
    recordings: [],
    refreshProjectExports: action,
    refreshProjects: action,
    refreshRecordings: action,
  };
  const workspace = {
    audioRecordingDialogOpen: false,
    clearPlaybackRange: action,
    closeAudioRecordingDialog: action,
    closeLibraryPanel: action,
    confirm: { dialog: null, onCancel: action, onConfirm: action, request: action },
    grid: { magnetEnabled: false },
    inspector: { mode: 'selection', openGridSettings: action, openSelection: action },
    leftSidebarCollapsed: false,
    libraryPanelOpen: false,
    openAudioRecordingDialog: action,
    openLibraryPanel: action,
    playbackRange: null,
    preview: {},
    sceneBackgroundColors: {},
    setPlaybackRange: action,
    toggleLibraryPanel: action,
    toggleSidebarCollapsed: action,
  };
  const runtime = {
    applyLoadedProject: action,
    assetUrls: {},
    pausePlayback: action,
    registerPreviewRuntime: action,
    seekTo: action,
    setPlaybackPlaying: action,
    setTimelinePreviewSuspended: action,
    setTimelinePreviewViewport: action,
    timelinePreviews: {},
    togglePlayback: action,
  };
  const commands = {
    assets: {},
    export: {},
    project: {},
  };
  return {
    commands,
    exportPort,
    history,
    libraries,
    lifecycle,
    playback,
    runtime,
    runtimeHook: fn(() => runtime),
    selection,
    session,
    telemetry,
    timeline,
    workspace,
  };
});

vi.mock('../../commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../commands')>()),
  useVideoEditorActionHandlers: () => mocks.commands,
}));
vi.mock('../../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session')>()),
  useVideoEditorRuntime: mocks.runtimeHook,
}));
vi.mock('../../session/history-shortcuts', () => ({
  useVideoEditorProjectHistoryShortcuts: vi.fn(),
}));
vi.mock('../libraries', () => ({ useVideoEditorLibraries: () => mocks.libraries }));
vi.mock('../overlay-playback', () => ({ useVideoEditorOverlayPlayback: vi.fn() }));
vi.mock('../playback-range', () => ({ usePlaybackRangeSanity: vi.fn() }));
vi.mock('../recording-telemetry', () => ({ useRecordingTelemetry: vi.fn() }));
vi.mock('../selections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selections')>()),
  useVideoEditorSelections: () => ({
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedObjectTrack: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: mocks.selection.selection,
  }),
}));
vi.mock('../workspace-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workspace-state')>()),
  useVideoEditorWorkspaceState: () => mocks.workspace,
}));
vi.mock('../store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store')>()),
  getCurrentVideoEditorCurrentTime: () => mocks.playback.currentTime,
  getCurrentVideoEditorExportJobId: () => null,
  getCurrentVideoEditorExportStateSnapshot: () => mocks.exportPort.exportState,
  getCurrentVideoEditorProjectId: () => null,
  getCurrentVideoEditorProjectSnapshot: () => mocks.lifecycle.project,
  getCurrentVideoEditorSelectedClipId: () => mocks.selection.selectedClipId,
  useVideoEditorClipSelectionPort: (selector: (port: typeof mocks.selection) => unknown) =>
    selector(mocks.selection),
  useVideoEditorDiagnosticsTelemetryPort: (selector: (port: typeof mocks.telemetry) => unknown) =>
    selector(mocks.telemetry),
  useVideoEditorExportPort: (selector: (port: typeof mocks.exportPort) => unknown) =>
    selector(mocks.exportPort),
  useVideoEditorHistoryPort: (selector: (port: typeof mocks.history) => unknown) =>
    selector(mocks.history),
  useVideoEditorPlaybackPort: (selector: (port: typeof mocks.playback) => unknown) =>
    selector(mocks.playback),
  useVideoEditorProjectLifecyclePort: (selector: (port: typeof mocks.lifecycle) => unknown) =>
    selector(mocks.lifecycle),
  useVideoEditorRuntimeSessionPort: (selector: (port: typeof mocks.session) => unknown) =>
    selector(mocks.session),
  useVideoEditorTimelineEditingPort: (selector: (port: typeof mocks.timeline) => unknown) =>
    selector(mocks.timeline),
}));

import { VideoEditorBlockingOverlayContext, VideoEditorLibrariesContext } from './contexts';
import { VideoEditorCompositionProvider } from './provider';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.playback.currentTime = 0;
  mocks.exportPort.exportState = { dialogOpen: false, error: null, isRunning: false };
  mocks.runtimeHook.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('keeps stable children and unrelated contexts isolated across provider updates', () => {
  const childRender = vi.fn();
  const libraryRender = vi.fn();
  const blockingRender = vi.fn();

  function StableChild() {
    childRender();
    return null;
  }
  function LibraryConsumer() {
    useContext(VideoEditorLibrariesContext);
    libraryRender();
    return null;
  }
  function BlockingConsumer() {
    useContext(VideoEditorBlockingOverlayContext);
    blockingRender();
    return null;
  }
  const stableChildren: ReactNode = (
    <>
      <StableChild />
      <LibraryConsumer />
      <BlockingConsumer />
    </>
  );
  const renderProvider = () =>
    root.render(<VideoEditorCompositionProvider>{stableChildren}</VideoEditorCompositionProvider>);

  act(renderProvider);
  mocks.playback.currentTime = 125;
  act(renderProvider);

  expect(mocks.runtimeHook).toHaveBeenCalledTimes(2);
  expect(childRender).toHaveBeenCalledTimes(1);
  expect(libraryRender).toHaveBeenCalledTimes(1);
  expect(blockingRender).toHaveBeenCalledTimes(1);

  mocks.exportPort.exportState = {
    ...mocks.exportPort.exportState,
    status: { progress: 0.5 },
  } as typeof mocks.exportPort.exportState;
  act(renderProvider);
  expect(blockingRender).toHaveBeenCalledTimes(1);

  mocks.exportPort.exportState = { ...mocks.exportPort.exportState, dialogOpen: true };
  act(renderProvider);
  expect(blockingRender).toHaveBeenCalledTimes(2);
});
