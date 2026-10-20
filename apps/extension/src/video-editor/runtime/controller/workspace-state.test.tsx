import { createQuickEditWatermark } from '../../../features/video/project/scene/watermark';
import { presentWorkspaceWatermarkPreview } from './workspace-state';
// @vitest-environment jsdom
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../../features/video/project/motion/spatial';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { presentWorkspaceMotionSpatialPreview } from './workspace-state';
import {
  createWorkspaceLayoutController,
  createWorkspaceHeaderController,
  createWorkspacePreviewController,
} from './workspace/core';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorWorkspaceState, type VideoEditorWorkspaceState } from './workspace-state';

function renderWorkspaceHarness(
  root: Root | null,
  onState: (state: VideoEditorWorkspaceState) => void
) {
  const Harness = () => {
    const nextWorkspaceState = useVideoEditorWorkspaceState();
    onState(nextWorkspaceState);
    return <div ref={nextWorkspaceState.preview.workspaceSplitRef} />;
  };

  act(() => {
    root?.render(<Harness />);
  });
}

function mockWorkspaceBounds(workspaceState: VideoEditorWorkspaceState) {
  const splitNode = workspaceState.preview.workspaceSplitRef.current!;
  vi.spyOn(splitNode, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  });
}

function dispatchResizeMove(clientY: number) {
  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientY', { value: clientY });
  window.dispatchEvent(moveEvent);
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let workspaceState: VideoEditorWorkspaceState | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  workspaceState = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('resolves the confirm dialog promise through the exposed callbacks', async () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  let pendingConfirm: Promise<boolean>;
  await act(async () => {
    pendingConfirm = workspaceState!.confirm.request({
      title: 'Delete project',
      message: 'Are you sure?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    await Promise.resolve();
  });

  expect(workspaceState!.confirm.dialog?.title).toBe('Delete project');

  act(() => {
    workspaceState!.confirm.onConfirm();
  });

  await expect(pendingConfirm!).resolves.toBe(true);
  expect(workspaceState!.confirm.dialog).toBeNull();
});

it('updates the preview pane height while vertical resize listeners are active', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  mockWorkspaceBounds(workspaceState!);

  act(() => {
    workspaceState!.preview.handleStartVerticalResize({
      button: 0,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<HTMLDivElement>);
  });

  act(() => {
    dispatchResizeMove(180);
  });

  expect(workspaceState!.preview.paneHeight).toBe(372);

  act(() => {
    window.dispatchEvent(new Event('pointerup'));
  });

  act(() => {
    dispatchResizeMove(220);
  });

  expect(workspaceState!.preview.paneHeight).toBe(372);
});

it('cleans up resize listeners when the workspace unmounts mid-drag', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  mockWorkspaceBounds(workspaceState!);
  act(() => {
    workspaceState!.preview.handleStartVerticalResize({
      button: 0,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<HTMLDivElement>);
  });
  act(() => {
    root?.unmount();
  });
  act(() => {
    dispatchResizeMove(180);
  });

  expect(workspaceState!.preview.paneHeight).toBeNull();
});

it('stores and clears the local playback loop range without touching project state', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });

  act(() => {
    workspaceState!.setPlaybackRange({ start: 1.25, end: 3.5 });
  });

  expect(workspaceState!.playbackRange).toEqual({ start: 1.25, end: 3.5 });

  act(() => {
    workspaceState!.clearPlaybackRange();
  });

  expect(workspaceState!.playbackRange).toBeNull();
});

it('freezes the audio destination and clears it on close or global recording entry', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  const target = { projectId: 'project', trackId: 'voice', startTime: 7, endTime: 12 };
  act(() => createWorkspaceLayoutController(workspaceState!).openTrackAudioRecordingDialog(target));
  target.startTime = 20;
  expect(createWorkspaceLayoutController(workspaceState!).audioRecordingTarget?.startTime).toBe(7);
  expect(workspaceState!.audioRecordingDialogOpen).toBe(true);
  act(() => workspaceState!.closeAudioRecordingDialog());
  expect(workspaceState!.audioRecordingTarget).toBeNull();
  expect(workspaceState!.audioRecordingDialogOpen).toBe(false);
  act(() => createWorkspaceLayoutController(workspaceState!).openTrackAudioRecordingDialog(target));
  act(() => workspaceState!.openAudioRecordingDialog());
  expect(workspaceState!.audioRecordingTarget).toBeNull();
  expect(workspaceState!.audioRecordingDialogOpen).toBe(true);
});

it.each([true, false])(
  'keeps the recording destination independent of viewer selection, transport and preferences (effect: %s)',
  (effectSelected) => {
    renderWorkspaceHarness(root, (state) => {
      workspaceState = state;
    });
    const project = createEmptyVideoProject('Voice');
    const target = { projectId: project.id, trackId: 'voice', startTime: 7, endTime: 12 };
    act(() => workspaceState!.openTrackAudioRecordingDialog(target));
    const store = {
      selection: effectSelected
        ? { kind: 'effect-instance' as const, effectInstanceId: 'region-fx' }
        : { kind: 'scene' as const },
      selectClip: vi.fn(),
      selectScene: vi.fn(),
      currentTime: 20,
      isPlaying: false,
    };
    const runtime = { seekTo: vi.fn(), togglePlayback: vi.fn(), pausePlayback: vi.fn() };
    const preview = createWorkspacePreviewController(
      {
        workspace: workspaceState!,
        store,
        selections: { selectedActionOccurrence: null, selectedMotionRegion: null },
        actions: {
          handleImportAudio: vi.fn(),
          handleImportImage: vi.fn(),
          handleImportVideo: vi.fn(),
        },
      } as unknown as Parameters<typeof createWorkspacePreviewController>[0],
      runtime as unknown as Parameters<typeof createWorkspacePreviewController>[1],
      project,
      { addActionEvent: vi.fn(), addMotionRegion: vi.fn(), enableCursorTrack: vi.fn() }
    );
    expect(preview.selection.selectedEffectInstanceId).toBe(effectSelected ? 'region-fx' : null);
    const header = createWorkspaceHeaderController(
      {
        workspace: workspaceState!,
        store: { ...store, openExportDialog: vi.fn(), renameProject: vi.fn() },
        libraries: { projectExports: [] },
        saveStateMeta: {} as never,
      },
      project
    );
    act(() => {
      preview.selection.onSelectClip('another-clip');
      preview.selection.onSelectScene();
      header.onSelectScene();
      preview.transport.onSeek(20);
      preview.preferences.onZoomChange('fit');
      preview.preferences.onModeChange(preview.preferences.mode);
      preview.preferences.onRasterPresetChange(preview.preferences.rasterPreset);
      preview.preferences.onFrameRateChange('15');
      preview.preferences.onShowFrameRateChange(true);
    });
    expect(store.selectClip).toHaveBeenCalledWith('another-clip');
    expect(runtime.seekTo).toHaveBeenCalledWith(20);
    expect(workspaceState!.preview.preferences.preferences.showFrameRate).toBe(true);
    expect(createWorkspaceLayoutController(workspaceState!).audioRecordingTarget).toEqual(target);
    act(() => header.onOpenAudioRecordingDialog());
    expect(createWorkspaceLayoutController(workspaceState!).audioRecordingTarget).toBeNull();
  }
);

it('reveals a collapsed inspector for the explicit Scene command', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  act(() => workspaceState!.toggleSidebarCollapsed());
  expect(workspaceState!.leftSidebarCollapsed).toBe(true);
  const selectScene = vi.fn();
  const header = createWorkspaceHeaderController(
    {
      workspace: workspaceState!,
      store: {
        selectScene,
        selection: { kind: 'scene' },
        openExportDialog: vi.fn(),
        renameProject: vi.fn(),
      },
      libraries: { projectExports: [] },
      saveStateMeta: {} as never,
    },
    createEmptyVideoProject('Scene')
  );
  act(() => header.onSelectScene());
  expect(selectScene).toHaveBeenCalledOnce();
  expect(workspaceState!.leftSidebarCollapsed).toBe(false);
});

it('opens a collapsed inspector for selection without changing the library or playback range', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  act(() => {
    workspaceState!.toggleSidebarCollapsed();
    workspaceState!.openLibraryPanel();
    workspaceState!.setPlaybackRange({ start: 1, end: 2 });
  });
  expect(workspaceState!.leftSidebarCollapsed).toBe(true);
  act(() => workspaceState!.inspector.openSelection());
  expect(workspaceState!.leftSidebarCollapsed).toBe(false);
  expect(workspaceState!.inspector.mode).toBe('selection');
  expect(workspaceState!.libraryPanelOpen).toBe(true);
  expect(workspaceState!.playbackRange).toEqual({ start: 1, end: 2 });
  act(() => workspaceState!.inspector.openSelection());
  expect(workspaceState!.leftSidebarCollapsed).toBe(false);
});

it('keeps recording leave admission scoped to the registered mounted recorder', async () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  const first = vi.fn(async () => false);
  const second = vi.fn(async () => true);
  const releaseFirst = workspaceState!.voiceRecording.register(first);
  await expect(workspaceState!.voiceRecording.request()).resolves.toBe(false);
  const releaseSecond = workspaceState!.voiceRecording.register(second);
  releaseFirst();
  await expect(workspaceState!.voiceRecording.request()).resolves.toBe(true);
  expect(second).toHaveBeenCalledOnce();
  releaseSecond();
  await expect(workspaceState!.voiceRecording.request()).resolves.toBe(true);
  expect(first).toHaveBeenCalledOnce();
});

it('keeps a spatial gesture disposable and exposes a stable cancellation callback', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  const callback = workspaceState!.inspector.previewMotionSpatial;
  const project = createEmptyVideoProject('Gesture');
  const preview = {
    project,
    regionId: 'region',
    edit: { kind: 'perspective' as const, rotateY: 20 },
  };
  act(() => callback(preview));
  expect(workspaceState!.inspector.motionSpatialPreview).toBe(preview);
  expect(workspaceState!.inspector.previewMotionSpatial).toBe(callback);
  act(() => callback(null));
  expect(workspaceState!.inspector.motionSpatialPreview).toBeNull();
});

it('presents a scalar spatial draft without changing accepted data or sibling fields', () => {
  const project = createEmptyVideoProject('Spatial');
  project.version = 19;
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'target',
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateX: 10 },
    spatialReference: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  };
  const sibling = { ...region, id: 'sibling' };
  project.motionRegions = [region, sibling];
  const snapshot = JSON.stringify(project);
  const selection = { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: region.id };
  const presented = presentWorkspaceMotionSpatialPreview(project, selection, {
    project,
    regionId: region.id,
    edit: { kind: 'perspective', rotateY: 35 },
  });
  expect(JSON.stringify(project)).toBe(snapshot);
  expect(presented.version).toBe(19);
  expect(presented.motionRegions?.[0]).toMatchObject({
    perspective: { enabled: true, rotateX: 10, rotateY: 35 },
    spatialReference: region.spatialReference,
  });
  expect(presented.motionRegions?.[1]).toBe(sibling);
  expect(presented.clips).toBe(project.clips);
  expect(isHydratableVideoProject(presented)).toBe(true);
  const reset = presentWorkspaceMotionSpatialPreview(project, selection, {
    project,
    regionId: region.id,
    edit: { kind: 'reference', reset: true },
  });
  expect(reset.motionRegions?.[0]).not.toHaveProperty('spatialReference');
  expect(reset.motionRegions?.[0]?.perspective).toBe(region.perspective);
});

it('rejects stale, foreign, unselected, missing, locked, invalid and unchanged spatial drafts', () => {
  const project = createEmptyVideoProject('Spatial');
  const region = { ...createVideoProjectMotionRegion(project, 0), id: 'target' };
  project.motionRegions = [region];
  const selection = { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: region.id };
  const preview = {
    project,
    regionId: region.id,
    edit: { kind: 'perspective' as const, rotateY: 35 },
  };
  expect(presentWorkspaceMotionSpatialPreview(project, selection, null)).toBe(project);
  expect(presentWorkspaceMotionSpatialPreview(project, { kind: 'scene' }, preview)).toBe(project);
  expect(
    presentWorkspaceMotionSpatialPreview(
      project,
      { ...selection, motionRegionId: 'other' },
      preview
    )
  ).toBe(project);
  for (const changed of [
    { ...project },
    { ...project, motionRegions: [] },
    { ...project, motionRegions: [{ ...region }] },
    {
      ...project,
      utilityLanes: {
        actions: { visible: true, locked: false },
        camera: { visible: true, locked: true },
      },
    },
  ]) {
    expect(presentWorkspaceMotionSpatialPreview(changed, selection, preview)).toBe(changed);
  }
  expect(
    presentWorkspaceMotionSpatialPreview(project, selection, { ...preview, regionId: 'missing' })
  ).toBe(project);
  expect(
    presentWorkspaceMotionSpatialPreview(project, selection, {
      ...preview,
      edit: { kind: 'perspective', rotateY: 90 },
    })
  ).toBe(project);
  expect(
    presentWorkspaceMotionSpatialPreview(project, selection, {
      ...preview,
      edit: { kind: 'perspective', rotateY: 0 },
    })
  ).toBe(project);
  const locked = {
    ...project,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    },
  };
  expect(
    presentWorkspaceMotionSpatialPreview(locked, selection, { ...preview, project: locked })
  ).toBe(locked);
});

it('upgrades only the presented legacy snapshot and refuses a missing selected region', () => {
  const project = createEmptyVideoProject('Legacy');
  project.version = 18;
  const region = { ...createVideoProjectMotionRegion(project, 0), id: 'legacy' };
  project.motionRegions = [region];
  const selection = { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: region.id };
  const preview = {
    project,
    regionId: region.id,
    edit: { kind: 'perspective' as const, rotateY: 35, enabled: true },
  };
  const presented = presentWorkspaceMotionSpatialPreview(project, selection, preview);
  expect(project.version).toBe(18);
  expect(project.motionRegions[0]).toBe(region);
  expect(project.motionRegions[0]!.perspective).toBeUndefined();
  expect(presented.version).toBe(19);
  expect(isHydratableVideoProject(presented)).toBe(true);
  const deleted = { ...project, motionRegions: [] };
  expect(
    presentWorkspaceMotionSpatialPreview(deleted, selection, { ...preview, project: deleted })
  ).toBe(deleted);
});

it('scopes watermark presentation to the accepted scene snapshot without writing source data', () => {
  const project = createEmptyVideoProject('Authored');
  const settings = { ...createQuickEditWatermark('Draft'), mode: 'text' as const };
  const before = structuredClone(project);
  const preview = { project, settings };
  const result = presentWorkspaceWatermarkPreview(project, { kind: 'scene' }, preview);
  expect(result.watermark).toBe(settings);
  expect(isHydratableVideoProject(result)).toBe(true);
  expect(project).toEqual(before);
  expect(
    presentWorkspaceWatermarkPreview(project, { kind: 'clip', clipId: 'other' }, preview)
  ).toBe(project);
  const changed = { ...project, name: 'Renamed' };
  expect(presentWorkspaceWatermarkPreview(changed, { kind: 'scene' }, preview)).toBe(changed);
});

it('cancels the registered watermark owner while ignoring stale unregister callbacks', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  const first = vi.fn(),
    second = vi.fn();
  const release = workspaceState!.inspector.registerWatermarkAbort(first);
  workspaceState!.inspector.registerWatermarkAbort(second);
  release();
  act(() => workspaceState!.inspector.cancelWatermarkAcquisition());
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  act(() => workspaceState!.inspector.cancelWatermarkAcquisition());
  expect(second).toHaveBeenCalledTimes(1);
  expect(workspaceState!.inspector.watermarkPreview).toBeNull();
});

it('keeps schema20 and the authored watermark when spatial draft presentation is active', () => {
  const project = createEmptyVideoProject('Spatial and watermark');
  project.version = 20;
  project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const region = { ...createVideoProjectMotionRegion(project, 0), id: 'region' };
  project.motionRegions = [region];
  const selection = { kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: region.id };
  const presented = presentWorkspaceMotionSpatialPreview(project, selection, {
    project,
    regionId: region.id,
    edit: { kind: 'perspective', rotateY: 20 },
  });
  expect(presented.version).toBe(20);
  expect(presented.watermark).toBe(project.watermark);
});
