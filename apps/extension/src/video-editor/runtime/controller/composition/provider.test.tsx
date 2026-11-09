// @vitest-environment jsdom
import {
  VideoProjectTrackRole,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  type VideoProject,
  type VideoProjectActionEvent,
} from '../../../../features/video/project/types';

import { RuntimePlaybackContext } from './contexts';
import { useVideoEditorOverlayPlayback } from '../overlay-playback';

import { act, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
  const selection: {
    selection: import('../../../contracts/selection').VideoEditorSelection;
    selectedClipId: string | null;
    selectedTrackId: string | null;
  } = {
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
    openExportDialog: fn(),
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
    voiceRecording: {
      obscured: false,
      capturing: false,
      setCapturing: vi.fn(),
      register: vi.fn(() => () => undefined),
      request: vi.fn(async () => true),
    },
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
    inspector: {
      mode: 'selection',
      openSelection: action,
      sceneEdgesPreview: null,
      previewSceneEdges: vi.fn(),
      watermarkPreview: null,
      previewWatermark: () => undefined,
      registerWatermarkAbort: () => () => undefined,
      cancelWatermarkAcquisition: fn(),
      motionPreview: null,
      previewMotion: action,
    },
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
    applyLoadedProject: fn(),
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
    playbackListeners: new Set<() => void>(),
    actionOccurrence: null as
      | import('../../../../features/video/project/action-occurrences').VideoProjectActionOccurrence
      | null,
    commandHook: fn(
      (_ports: Parameters<typeof import('../../commands').useVideoEditorActionHandlers>[0]) =>
        commands
    ),
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
  useVideoEditorActionHandlers: mocks.commandHook,
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
  useVideoEditorSelections: (
    project: import('../../../../features/video/project/types').VideoProject | null,
    selection: import('../../../contracts/selection').VideoEditorSelection,
    selectedClipId: string | null
  ) =>
    useMemo(
      () => ({
        selectedActionOccurrence: mocks.actionOccurrence,
        selectedClip: project?.clips.find((clip) => clip.id === selectedClipId) ?? null,
        selectedCursorSample: null,
        selectedMotionRegion: null,
        selectedObjectTrack: null,
        selectedTrack: null,
        selectedTransition: null,
        selection,
      }),
      [project, selection, selectedClipId]
    ),
}));
vi.mock('../workspace-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workspace-state')>()),
  useVideoEditorWorkspaceState: () => mocks.workspace,
}));
function subscribeMockPlayback(listener: () => void) {
  mocks.playbackListeners.add(listener);
  return () => mocks.playbackListeners.delete(listener);
}

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
  useVideoEditorPlaybackPort: (selector: (port: typeof mocks.playback) => unknown) => {
    const selectSnapshot = useShallow((port: typeof mocks.playback) => selector({ ...port }));
    return useSyncExternalStore(subscribeMockPlayback, () => selectSnapshot(mocks.playback));
  },
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
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../../features/video/project/factories/creation';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.workspace.autoProcessingModalOpen = false;
  mocks.playback.currentTime = 0;
  mocks.playbackListeners.clear();
  mocks.actionOccurrence = null;
  mocks.selection.selection = { kind: 'scene' };
  mocks.selection.selectedClipId = null;
  mocks.selection.selectedTrackId = null;
  mocks.lifecycle.project = null;
  mocks.workspace.preview.sourceViewerActive = false;
  mocks.exportPort.exportState = { dialogOpen: false, error: null, isRunning: false };
  mocks.runtimeHook.mockClear();
  mocks.commandHook.mockClear();
  mocks.workspace.inspector.cancelWatermarkAcquisition.mockClear();
  mocks.workspace.voiceRecording.request.mockReset().mockResolvedValue(true);
  mocks.exportPort.openExportDialog.mockClear();
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
  expect(blockingRender).toHaveBeenCalledTimes(1);
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
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(true);
  mocks.exportPort.exportState.isRunning = true;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.exportPort.exportState.isRunning = false;
  mocks.exportPort.exportState.dialogOpen = false;
  act(render);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(true);
});

it('binds export only to the ready montage workspace outside blocking layers and source viewing', () => {
  const render = (commandPaletteOpen = false) =>
    root.render(<VideoEditorCompositionProvider commandPaletteOpen={commandPaletteOpen} />);
  const exportKey = () => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyM',
      ctrlKey: true,
    });
    act(() => window.dispatchEvent(event));
    return event;
  };
  act(() => render());
  expect(exportKey().defaultPrevented).toBe(false);
  mocks.lifecycle.project = createEmptyVideoProject('Export shortcut');
  act(() => render());
  expect(exportKey().defaultPrevented).toBe(true);
  expect(mocks.exportPort.openExportDialog).toHaveBeenCalledTimes(1);
  mocks.workspace.preview.sourceViewerActive = true;
  act(() => render());
  expect(exportKey().defaultPrevented).toBe(false);
  mocks.workspace.preview.sourceViewerActive = false;
  act(() => render(true));
  expect(exportKey().defaultPrevented).toBe(false);
  act(() => render());
  mocks.exportPort.exportState.dialogOpen = true;
  act(() => render());
  expect(exportKey().defaultPrevented).toBe(true);
  expect(mocks.exportPort.openExportDialog).toHaveBeenCalledTimes(2);
});

it('keeps ordinary media inspector rendering independent of clock-only updates', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'inspector-clock',
    filename: 'clock.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  mocks.lifecycle.project = project;
  mocks.selection.selection = { kind: 'clip', clipId: clip.id };
  mocks.selection.selectedClipId = clip.id;
  mocks.selection.selectedTrackId = clip.trackId;
  let renders = 0;
  function InspectorConsumer() {
    const controller = useVideoEditorSidebarController();
    expect(controller?.state.selectedClip?.id).toBe(clip.id);
    renders++;
    return null;
  }
  act(() =>
    root.render(
      <VideoEditorCompositionProvider>
        <InspectorConsumer />
      </VideoEditorCompositionProvider>
    )
  );
  const before = renders;
  act(() => {
    mocks.playback.currentTime = 3.5;
    for (const listener of mocks.playbackListeners) listener();
  });
  expect(renders).toBe(before);
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

it('keeps recording-owned video playback out of overlay pause while blocking global shortcuts', () => {
  mocks.lifecycle.project = createEmptyVideoProject('Voice');
  mocks.workspace.voiceRecording.capturing = true;
  act(() => root.render(<VideoEditorCompositionProvider />));
  expect(vi.mocked(useVideoEditorOverlayPlayback).mock.lastCall?.[0].enabled).toBe(false);
  expect(mocks.runtimeHook.mock.lastCall?.[0].playback.shortcutsEnabled).toBe(false);
  mocks.workspace.voiceRecording.capturing = false;
});

it('cancels a watermark gesture only after the existing leave admission succeeds', async () => {
  act(() => root.render(<VideoEditorCompositionProvider />));
  const leave = mocks.commandHook.mock.lastCall![0].project.beforeLeave!;
  mocks.workspace.voiceRecording.request.mockResolvedValueOnce(false);
  await expect(leave()).resolves.toBe(false);
  expect(mocks.workspace.inspector.cancelWatermarkAcquisition).not.toHaveBeenCalled();
  await expect(leave()).resolves.toBe(true);
  expect(mocks.workspace.inspector.cancelWatermarkAcquisition).toHaveBeenCalledTimes(1);
});

it('cancels an acquisition started during project loading before applying the loaded document', () => {
  act(() => root.render(<VideoEditorCompositionProvider />));
  const order: string[] = [];
  mocks.workspace.inspector.cancelWatermarkAcquisition.mockImplementationOnce(() => {
    order.push('cancel');
  });
  mocks.runtime.applyLoadedProject.mockImplementationOnce(() => {
    order.push('apply');
  });
  const project = createEmptyVideoProject('Reloaded');
  mocks.commandHook.mock.lastCall![0].project.applyLoadedProject(project, null);
  expect(order).toEqual(['cancel', 'apply']);
  expect(mocks.runtime.applyLoadedProject).toHaveBeenLastCalledWith(project, null);
});

it('keeps camera position fields live and an existing camera command reads the latest time', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'live-camera',
    filename: 'camera.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  project.tracks.find((track) => track.id === clip.trackId)!.role = VideoProjectTrackRole.CAMERA;
  mocks.lifecycle.project = project;
  mocks.selection.selection = { kind: 'clip', clipId: clip.id };
  mocks.selection.selectedClipId = clip.id;
  mocks.selection.selectedTrackId = clip.trackId;
  const snapshots: (number | undefined)[] = [];
  let controller: ReturnType<typeof useVideoEditorSidebarController> = null;
  const originalSetTime = mocks.playback.setCurrentTime;
  const setTime = vi.fn();
  mocks.playback.setCurrentTime = setTime;
  Reflect.set(mocks.timeline, 'updateProject', (update: (value: VideoProject) => VideoProject) => {
    mocks.lifecycle.project = update(project);
  });
  function InspectorConsumer() {
    controller = useVideoEditorSidebarController();
    snapshots.push(controller?.state.currentTime);
    return null;
  }
  try {
    act(() =>
      root.render(
        <VideoEditorCompositionProvider>
          <InspectorConsumer />
        </VideoEditorCompositionProvider>
      )
    );
    const readController = () => controller;
    const add = readController()?.clipActions.onEditCameraPosition;
    expect(add).toBeDefined();
    act(() => {
      mocks.playback.currentTime = 3;
      for (const listener of mocks.playbackListeners) listener();
    });
    expect(snapshots).toEqual([0, 3]);
    add?.(clip.id, { kind: 'add' });
    expect(setTime).toHaveBeenLastCalledWith(3.5);
    expect(mocks.lifecycle.project?.clips[0]).toMatchObject({
      cameraPositions: [{ sourceTime: 3, transition: { kind: 'smooth' } }],
    });
  } finally {
    Reflect.deleteProperty(mocks.timeline, 'updateProject');
    mocks.playback.setCurrentTime = originalSetTime;
  }
});

it('keeps selected action placement tied to the live playhead', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'live-action',
    filename: 'action.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 10,
  });
  const event: VideoProjectActionEvent = {
    data: { button: 'primary' },
    capturedDuration: 0.2,
    id: 'action-clock',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 100, y: 120 },
    presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
    anchor: { kind: 'project', time: 1 },
  };
  project.actionEvents.push(event);
  mocks.lifecycle.project = project;
  mocks.selection.selection = { kind: 'action-occurrence', eventId: event.id, clipId: null };
  mocks.actionOccurrence = {
    event,
    eventId: event.id,
    clipId: null,
    time: 1,
    sourceInstanceId: null,
    playbackRun: null,
  };
  const snapshots: (number | undefined)[] = [];
  function InspectorConsumer() {
    const controller = useVideoEditorSidebarController();
    snapshots.push(controller?.state.currentTime);
    return null;
  }
  act(() =>
    root.render(
      <VideoEditorCompositionProvider>
        <InspectorConsumer />
      </VideoEditorCompositionProvider>
    )
  );
  act(() => {
    mocks.playback.currentTime = 1;
    for (const listener of mocks.playbackListeners) listener();
  });
  expect(snapshots).toEqual([0, 1]);
});

it('keeps a non-following preview controller idle while time queries and following consumers stay current', () => {
  mocks.lifecycle.project = createEmptyVideoProject('Preview clock isolation');
  let snapshotController: ReturnType<typeof useVideoEditorPreviewController> = null;
  const snapshotRenders = vi.fn();
  const followingTimes: number[] = [];
  function SnapshotConsumer() {
    snapshotController = useVideoEditorPreviewController(false);
    snapshotRenders();
    return null;
  }
  function FollowingConsumer() {
    const controller = useVideoEditorPreviewController();
    if (controller) followingTimes.push(controller.transport.currentTime);
    return null;
  }
  act(() =>
    root.render(
      <VideoEditorCompositionProvider>
        <SnapshotConsumer />
        <FollowingConsumer />
      </VideoEditorCompositionProvider>
    )
  );
  const renders = snapshotRenders.mock.calls.length;
  const readSnapshotController = () => snapshotController;
  const retained = readSnapshotController();
  act(() => {
    mocks.playback.currentTime = 3.5;
    mocks.playbackListeners.forEach((listener) => listener());
  });
  expect(followingTimes.at(-1)).toBe(3.5);
  expect(snapshotRenders).toHaveBeenCalledTimes(renders);
  expect(retained?.transport.currentTime).toBe(3.5);
});
