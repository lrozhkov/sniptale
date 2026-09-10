// @vitest-environment jsdom
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

it('keeps the recording destination independent of viewer selection, transport and preferences', () => {
  renderWorkspaceHarness(root, (state) => {
    workspaceState = state;
  });
  const project = createEmptyVideoProject('Voice');
  const target = { projectId: project.id, trackId: 'voice', startTime: 7, endTime: 12 };
  act(() => workspaceState!.openTrackAudioRecordingDialog(target));
  const store = { selectClip: vi.fn(), selectScene: vi.fn(), currentTime: 20, isPlaying: false };
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
});

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
      store: { selectScene, openExportDialog: vi.fn(), renameProject: vi.fn() },
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
