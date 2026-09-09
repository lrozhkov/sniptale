import { RuntimePlaybackContext } from './contexts';
import { useVideoEditorOverlayPlayback } from '../overlay-playback';
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
    project: null as import('../../../../features/video/project/types').VideoProject | null,
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
    beginProjectHistoryTransaction: action,
    endProjectHistoryTransaction: action,
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
    projectDialogOpen: false,
    setProjectDialogOpen: action,
    autoProcessingModalOpen: false,
    setAutoProcessingModalOpen: action,
    audioRecordingDialogOpen: false,
    audioRecordingTarget: null as
      | import('../../../contracts/insertion').VideoEditorAudioRecordingTarget
      | null,
    openTrackAudioRecordingDialog: action,
    clearPlaybackRange: action,
    closeAudioRecordingDialog: action,
    closeLibraryPanel: action,
    confirm: { dialog: null, onCancel: action, onConfirm: action, request: action },
    grid: { magnetEnabled: false },
    inspector: { mode: 'selection', openSelection: action },
    leftSidebarCollapsed: false,
    libraryPanelOpen: false,
    openAudioRecordingDialog: action,
    openLibraryPanel: action,
    playbackRange: null,
    preview: {
      sourceViewerActive: false,
      preferences: {
        preferences: { mode: 'live', rasterPreset: '720p', zoom: 'fit' },
        updatePreferences: action,
        retrySave: action,
        saveFailed: false,
      },
    },
    sceneBackgroundColors: {},
    setPlaybackRange: action,
    toggleLibraryPanel: action,
    toggleSidebarCollapsed: action,
  };
  const runtime = {
    isPreparingPlayback: false,
    applyLoadedProject: action,
    assetUrls: {},
    pausePlayback: action,
    registerPreviewRuntime: action,
    seekTo: action,
    stepByFrames: action,
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
    effects: { updateEffectInstance: fn() },
    exportPort,
    history,
    libraries,
    lifecycle,
    playback,
    runtime,
    runtimeHook: fn((_args: { playback: { shortcutsEnabled: boolean } }) => runtime),
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
vi.mock('../libraries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../libraries')>()),
  useVideoEditorLibraries: () => mocks.libraries,
}));
vi.mock('../overlay-playback', () => ({ useVideoEditorOverlayPlayback: vi.fn() }));
vi.mock('../playback-range', () => ({ usePlaybackRangeSanity: vi.fn() }));
vi.mock('../recording-telemetry', () => ({ useRecordingTelemetry: vi.fn() }));
vi.mock('../selections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selections')>()),
  useVideoEditorSelections: () => ({
    selectedActionOccurrence: null,
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
  useVideoEditorEffectEditingPort: (selector: (port: typeof mocks.effects) => unknown) =>
    selector(mocks.effects),
  useVideoEditorClipSelectionPort: (selector: (port: typeof mocks.selection) => unknown) =>
    selector(mocks.selection),
  useVideoEditorRecordingTelemetryPort: (selector: (port: typeof mocks.telemetry) => unknown) =>
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
import { useVideoEditorSidebarController, useVideoEditorPreviewController } from './hooks';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.workspace.autoProcessingModalOpen = false;
  mocks.playback.currentTime = 0;
  mocks.lifecycle.project = null;
  mocks.workspace.preview.sourceViewerActive = false;
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

it('admits montage shortcuts only when the montage viewer is active and no overlay blocks input', () => {
  const render = () => root.render(<VideoEditorCompositionProvider />);
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(true);
  mocks.workspace.preview.sourceViewerActive = true;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.workspace.preview.sourceViewerActive = false;
  mocks.exportPort.exportState.dialogOpen = true;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.exportPort.exportState.dialogOpen = false;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(true);
});

it('keeps inspector time on the live playback port across seeks', () => {
  const snapshots: (number | undefined)[] = [];
  function InspectorConsumer() {
    const controller = useVideoEditorSidebarController();
    snapshots.push(controller?.state.currentTime);
    return null;
  }
  const render = () =>
    root.render(
      <VideoEditorCompositionProvider>
        <InspectorConsumer />
      </VideoEditorCompositionProvider>
    );
  mocks.lifecycle.project = createEmptyVideoProject('Inspector clock');
  act(render);
  mocks.playback.currentTime = 3.5;
  act(render);
  expect(snapshots).toEqual([0, 3.5]);
});

it('suspends montage shortcuts while auto-processing owns the modal', () => {
  const render = () => root.render(<VideoEditorCompositionProvider />);
  mocks.workspace.autoProcessingModalOpen = true;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.workspace.autoProcessingModalOpen = false;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(true);
});

it('keeps input blocked while interval recording owns playback instead of the overlay pause policy', () => {
  mocks.lifecycle.project = createEmptyVideoProject('Voice');
  mocks.workspace.audioRecordingDialogOpen = true;
  mocks.workspace.audioRecordingTarget = {
    projectId: mocks.lifecycle.project.id,
    trackId: 'voice',
    startTime: 0,
    endTime: 3,
  };
  act(() => root.render(<VideoEditorCompositionProvider />));
  expect(vi.mocked(useVideoEditorOverlayPlayback).mock.lastCall?.[0].enabled).toBe(false);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.workspace.audioRecordingTarget = null;
  act(() => root.render(<VideoEditorCompositionProvider />));
  expect(vi.mocked(useVideoEditorOverlayPlayback).mock.lastCall?.[0].enabled).toBe(true);
  mocks.workspace.audioRecordingDialogOpen = false;
});

it('connects canvas scene-anchor edits to the authoritative effect mutation port', () => {
  mocks.lifecycle.project = createEmptyVideoProject('Anchors');
  let controller: ReturnType<typeof useVideoEditorPreviewController> = null;
  function PreviewConsumer() {
    controller = useVideoEditorPreviewController();
    return null;
  }
  act(() =>
    root.render(
      <VideoEditorCompositionProvider>
        <PreviewConsumer />
      </VideoEditorCompositionProvider>
    )
  );
  expect(controller).not.toBeNull();
  const patch = { sceneAnchors: { tip: { x: 30, y: 40 } } };
  act(() => controller?.editing.onUpdateEffectInstance('effect', patch));
  expect(mocks.effects.updateEffectInstance).toHaveBeenCalledWith('effect', patch);
});

it('publishes cache preparation changes through the playback context', () => {
  let preparing: boolean | undefined;
  function Consumer() {
    preparing = useContext(RuntimePlaybackContext)?.isPreparingPlayback;
    return null;
  }
  const render = () =>
    root.render(
      <VideoEditorCompositionProvider>
        <Consumer />
      </VideoEditorCompositionProvider>
    );
  act(render);
  expect(preparing).toBe(false);
  mocks.runtime.isPreparingPlayback = true;
  act(render);
  expect(preparing).toBe(true);
  mocks.runtime.isPreparingPlayback = false;
  act(render);
  expect(preparing).toBe(false);
});
