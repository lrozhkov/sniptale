import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  createVideoEditorCommandPaletteController,
  createVideoEditorHistoryController,
  createVideoEditorOverlaysController,
  createVideoEditorShellController,
} from './shell';
import { useVideoEditorStore } from '../../state/store';

it('builds the shell from its exact projection', () => {
  const project = createEmptyVideoProject('Capability shell');
  expect(createVideoEditorShellController({ error: null, isReady: true, project })).toEqual({
    error: null,
    isReady: true,
    project,
  });
});

it('routes palette editing, playback and panel actions without a diagnostics capability', () => {
  const store = {
    currentTime: 120,
    isPlaying: false,
    selectedClipId: 'clip-1',
    deleteClip: vi.fn(),
    duplicateClip: vi.fn(),
    splitClipAt: vi.fn(),
    addShapeOverlay: vi.fn(),
    addTextOverlay: vi.fn(),
    openExportDialog: vi.fn(),
  };
  const runtime = { togglePlayback: vi.fn() };
  const workspace = { leftSidebarCollapsed: false, toggleSidebarCollapsed: vi.fn() };
  const controller = createVideoEditorCommandPaletteController({ store, runtime, workspace });
  controller.onSplitSelectedClip();
  controller.onDuplicateSelectedClip();
  controller.onDeleteSelectedClip();
  controller.onAddTextOverlay();
  controller.onOpenExportDialog();
  controller.togglePlaying();
  controller.toggleSidebarCollapsed();
  expect(store.splitClipAt).toHaveBeenCalledWith('clip-1', 120);
  expect(store.duplicateClip).toHaveBeenCalledWith('clip-1');
  expect(store.deleteClip).toHaveBeenCalledWith('clip-1');
  expect(store.addTextOverlay).toHaveBeenCalledOnce();
  expect(store.openExportDialog).toHaveBeenCalledOnce();
  expect(runtime.togglePlayback).toHaveBeenCalledOnce();
  expect(workspace.toggleSidebarCollapsed).toHaveBeenCalledOnce();
  expect(controller).not.toHaveProperty('toggleDiagnostics');
});

it('suspends history actions for blocking overlays and restores them when editing resumes', () => {
  const store = {
    ...useVideoEditorStore.getState(),
    projectHistoryStatus: {
      error: null,
      canUndo: true,
      canRedo: true,
    },
    projectHistoryTransactionActive: false,
    undoProject: vi.fn(),
    redoProject: vi.fn(),
  };
  const blocked = createVideoEditorHistoryController(store, false);
  blocked.onUndo();
  blocked.onRedo();
  expect(blocked.canUndo).toBe(false);
  expect(blocked.canRedo).toBe(false);
  expect(store.undoProject).not.toHaveBeenCalled();
  expect(store.redoProject).not.toHaveBeenCalled();
  const active = createVideoEditorHistoryController(store, true);
  active.onUndo();
  active.onRedo();
  expect(active.canUndo).toBe(true);
  expect(active.canRedo).toBe(true);
  expect(store.undoProject).toHaveBeenCalledOnce();
  expect(store.redoProject).toHaveBeenCalledOnce();
});

it('retains export retry and cancel routes with and without a loaded project', () => {
  const actions = { handleStartExport: vi.fn(), handleCancelExport: vi.fn() };
  const workspace = {
    playbackRange: { start: 1, end: 3 },
    confirm: { dialog: null, onCancel: vi.fn(), onConfirm: vi.fn(), request: vi.fn() },
  };
  const project = createEmptyVideoProject('Export');
  const store = { ...useVideoEditorStore.getState(), project, selectedClipId: 'clip-1' };
  const controller = createVideoEditorOverlaysController({ actions, store, workspace });
  expect(controller.exportDialog.sourceDimensions).toEqual({
    width: project.width,
    height: project.height,
  });
  expect(controller.exportDialog.selectedClipId).toBe('clip-1');
  expect(controller.exportDialog.selectedRangeAvailable).toBe(true);
  controller.exportFailure.onRetry();
  controller.exportProgress.onCancel();
  expect(actions.handleStartExport).toHaveBeenCalledOnce();
  expect(actions.handleCancelExport).toHaveBeenCalledOnce();
  expect(
    createVideoEditorOverlaysController({
      actions,
      store: { ...store, project: null },
      workspace,
    }).exportDialog.sourceDimensions
  ).toBeNull();
});
