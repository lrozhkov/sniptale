import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  VideoProjectShapeType,
} from '../../../features/video/project/types';
import { createSceneSelection } from '../../project/selection/model';
import type { VideoEditorState } from '../../state/store';
import {
  createVideoEditorCommandPaletteController,
  createVideoEditorOverlaysController,
  createVideoEditorWorkspaceController,
} from './builders';
import {
  BUILDER_STORE_ACTION_NAMES,
  createBuilderActions,
  createBuilderRuntimeState,
  createBuilderSelections,
  createBuilderWorkspaceState,
} from './builders.test-support';

function createStoreActions() {
  return Object.fromEntries(
    BUILDER_STORE_ACTION_NAMES.map((name) => [name, vi.fn()])
  ) as unknown as Pick<VideoEditorState, (typeof BUILDER_STORE_ACTION_NAMES)[number]>;
}

function createStoreOverrides(): VideoEditorState {
  const project = createEmptyVideoProject('Builder Test');

  return {
    project,
    recordingId: 'recording-1',
    isReady: true,
    error: null,
    saveState: 'saved',
    currentTime: 12,
    isPlaying: true,
    pixelsPerSecond: 120,
    placementMode: null,
    selection: createSceneSelection(),
    selectedTrackId: project.tracks[0]?.id ?? null,
    selectedClipId: null,
    diagnosticsOpen: false,
    recordingTelemetry: null,
    telemetryLaneVisible: false,
    exportState: {
      dialogOpen: true,
      error: null,
      isRunning: true,
      jobId: 'job-1',
      lastResult: null,
      settings: {
        downloadAfterExport: true,
        format: VideoExportFormat.MP4,
        fps: 30,
        height: 1080,
        quality: VideoExportQualityPreset.BALANCED,
        width: 1920,
      },
      status: {
        message: 'Rendering project',
        phase: VideoProjectExportPhase.RENDERING,
        progress: 0.5,
      },
    },
    ...createStoreActions(),
  };
}

function createLibrariesState(store: VideoEditorState) {
  return {
    projectExports: [
      {
        createdAt: 3,
        duration: store.project!.duration,
        filename: 'builder-test.mp4',
        format: VideoExportFormat.MP4,
        fps: 30,
        height: 1080,
        id: 'export-1',
        mimeType: 'video/mp4',
        projectId: store.project!.id,
        recordingId: 'recording-1',
        size: 1024,
        width: 1920,
      },
    ],
    projects: [
      {
        clipCount: store.project!.clips.length,
        createdAt: 1,
        duration: store.project!.duration,
        height: store.project!.height,
        id: store.project!.id,
        name: 'Builder Test',
        thumbnailId: `video-project:${store.project!.id}`,
        thumbnailSourceMediaId: null,
        trackCount: store.project!.tracks.length,
        updatedAt: 2,
        width: store.project!.width,
      },
    ],
    refreshProjectExports: vi.fn(),
    refreshProjects: vi.fn(),
    refreshRecordings: vi.fn(),
    recordings: [],
  };
}

function createWorkspaceArgs(store: VideoEditorState) {
  return {
    actions: createBuilderActions(),
    cursorDetection: {
      cancel: vi.fn(),
      runForClip: vi.fn(),
      runForSelectedClip: vi.fn(),
      runLocalRecalculation: vi.fn(),
      selectedClipAvailability: { canRun: false, reason: 'not-video' as const },
      state: {
        clipId: null,
        error: null,
        processedFrames: 0,
        progress: 0,
        status: 'idle' as const,
        totalFrames: 0,
        trackId: null,
      },
    },
    diagnosticsContent: 'diagnostics',
    libraries: createLibrariesState(store),
    runtime: createBuilderRuntimeState(),
    saveStateMeta: {
      className: 'is-saved',
      label: 'Saved',
    },
    selections: createBuilderSelections(store),
    store,
    workspace: createBuilderWorkspaceState(),
  };
}

function verifyWorkspaceController() {
  const store = createStoreOverrides();
  const args = createWorkspaceArgs(store);
  const controller = createVideoEditorWorkspaceController(args);

  expect(controller).not.toBeNull();
  if (!controller) {
    throw new Error('Expected workspace controller for active project.');
  }

  controller.sidebar.projectActions.onSetSceneBackground({
    kind: 'solid',
    color: '#000000',
  });
  controller.sidebar.projectActions.onResizeProject(1280, 720);
  controller.timeline.actions.onMoveActionEvent('action-1', 4);
  controller.timeline.actions.onMoveCursorSegment('sample-1', null, 2, null);
  controller.timeline.actions.onMoveTransitionSegment('transition-1', 7);
  void controller.timeline.actions.insertion.onImport.image(new File(['x'], 'shot.png'));
  controller.timeline.actions.insertion.onAddTrack();
  controller.timeline.actions.insertion.onAddMotionRegion();
  controller.timeline.actions.onSplitSelectedClip();
  controller.timeline.actions.onDuplicateSelectedClip();
  controller.timeline.actions.onDeleteSelectedClip();
  controller.preview.transport.onPausePlayback();
  controller.preview.preferences.onModeChange('cache');

  expect(store.updateProject).toHaveBeenCalledTimes(5);
  expect(store.moveClip).not.toHaveBeenCalled();
  expect(store.splitClipAt).not.toHaveBeenCalled();
  expect(store.duplicateClip).not.toHaveBeenCalled();
  expect(store.deleteClip).not.toHaveBeenCalled();
  expect(args.actions.handleImportImage).toHaveBeenCalledTimes(1);
  expect(store.addTrack).toHaveBeenCalledTimes(1);
  expect(controller.header.projectName).toBe('Builder Test');
  expect(controller.preview.assetUrls['asset']).toBe('blob:asset');
  expect(args.runtime.pausePlayback).toHaveBeenCalledOnce();
  expect(args.workspace.preview.preferences.updatePreferences).toHaveBeenCalledWith({
    mode: 'cache',
  });
  expect(controller.timeline.state.magnetEnabled).toBe(true);
}

function verifyOverlayAndPaletteControllers() {
  const store = createStoreOverrides();
  store.selectedClipId = 'clip-1';
  store.exportState.error = 'render failed';
  const overlays = createTestOverlaysController(store);
  const palette = createTestCommandPaletteController(store);

  palette.onAddTextOverlay();
  palette.onAddShapeOverlay(VideoProjectShapeType.ELLIPSE);
  palette.onSplitSelectedClip();
  palette.onDuplicateSelectedClip();
  palette.onDeleteSelectedClip();
  palette.toggleDiagnostics();

  expect(overlays.confirmDialog?.title).toBe('Discard changes?');
  expect(overlays.exportDialog.isOpen).toBe(true);
  expect(overlays.exportProgress.isRunning).toBe(true);
  expect(overlays.exportFailure.error).toBe('render failed');
  expect(store.addTextOverlay).toHaveBeenCalledTimes(1);
  expect(store.addShapeOverlay).toHaveBeenCalledWith(VideoProjectShapeType.ELLIPSE);
  expect(store.splitClipAt).toHaveBeenCalledWith('clip-1', 12);
  expect(store.duplicateClip).toHaveBeenCalledWith('clip-1');
  expect(store.deleteClip).toHaveBeenCalledWith('clip-1');
  expect(store.setDiagnosticsOpen).toHaveBeenCalledWith(true);
}

function createTestOverlaysController(store: VideoEditorState) {
  return createVideoEditorOverlaysController({
    actions: {
      handleCancelExport: vi.fn(),
      handleStartExport: vi.fn(),
    } as never,
    store,
    workspace: {
      confirm: {
        dialog: {
          title: 'Discard changes?',
          message: 'Body',
          confirmText: 'Discard',
          cancelText: 'Keep',
        },
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      },
    } as never,
  });
}

function createTestCommandPaletteController(store: VideoEditorState) {
  return createVideoEditorCommandPaletteController({
    runtime: {
      togglePlayback: vi.fn(),
    },
    store,
    workspace: {
      leftSidebarCollapsed: true,
      toggleSidebarCollapsed: vi.fn(),
    } as never,
  });
}

describe('video editor controller builders', () => {
  it('builds workspace slices and keeps selected-clip actions guarded', verifyWorkspaceController);

  it(
    'builds overlay and command-palette slices from owned runtime state',
    verifyOverlayAndPaletteControllers
  );
});
