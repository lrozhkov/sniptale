import { expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { VideoProjectShapeType } from '../../../features/video/project/types';
import type { VideoEditorCommandPaletteController } from '../../runtime/controller/contracts/surface';
import { buildVideoEditorCommandPaletteActions } from './actions';

function createPaletteController(): VideoEditorCommandPaletteController {
  return {
    diagnosticsOpen: false,
    isPlaying: false,
    leftSidebarCollapsed: false,
    onAddShapeOverlay: vi.fn(),
    onAddTextOverlay: vi.fn(),
    onDeleteSelectedClip: vi.fn(),
    onDuplicateSelectedClip: vi.fn(),
    onOpenExportDialog: vi.fn(),
    onSplitSelectedClip: vi.fn(),
    selectedClipId: 'clip-1',
    toggleDiagnostics: vi.fn(),
    togglePlaying: vi.fn(),
    toggleSidebarCollapsed: vi.fn(),
  };
}

function selectAction(controller: VideoEditorCommandPaletteController, actionId: string) {
  const action = buildVideoEditorCommandPaletteActions(controller).find(
    ({ id }) => id === actionId
  );

  if (!action) {
    throw new Error(`Expected action ${actionId}`);
  }

  return action;
}

it('routes project, playback, and tool actions through narrow controller callbacks', () => {
  const controller = createPaletteController();

  selectAction(controller, 'video-editor-open-export').onSelect();
  selectAction(controller, 'video-editor-toggle-sidebar').onSelect();
  selectAction(controller, 'video-editor-toggle-diagnostics').onSelect();
  selectAction(controller, 'video-editor-toggle-playback').onSelect();
  selectAction(controller, 'video-editor-add-text').onSelect();
  selectAction(controller, 'video-editor-add-rectangle').onSelect();
  selectAction(controller, 'video-editor-add-ellipse').onSelect();

  expect(controller.onOpenExportDialog).toHaveBeenCalledTimes(1);
  expect(controller.toggleSidebarCollapsed).toHaveBeenCalledTimes(1);
  expect(controller.toggleDiagnostics).toHaveBeenCalledTimes(1);
  expect(controller.togglePlaying).toHaveBeenCalledTimes(1);
  expect(controller.onAddTextOverlay).toHaveBeenCalledTimes(1);
  expect(controller.onAddShapeOverlay).toHaveBeenNthCalledWith(1, VideoProjectShapeType.RECTANGLE);
  expect(controller.onAddShapeOverlay).toHaveBeenNthCalledWith(2, VideoProjectShapeType.ELLIPSE);
});

it('routes timeline actions through narrow controller callbacks', () => {
  const controller = createPaletteController();

  selectAction(controller, 'video-editor-split-clip').onSelect();
  selectAction(controller, 'video-editor-duplicate-clip').onSelect();
  selectAction(controller, 'video-editor-delete-clip').onSelect();

  expect(controller.onSplitSelectedClip).toHaveBeenCalledTimes(1);
  expect(controller.onDuplicateSelectedClip).toHaveBeenCalledTimes(1);
  expect(controller.onDeleteSelectedClip).toHaveBeenCalledTimes(1);
});

it('keeps timeline actions disabled when there is no selected clip', () => {
  const controller = createPaletteController();
  controller.selectedClipId = null;

  const actions = buildVideoEditorCommandPaletteActions(controller);

  expect(actions.find((action) => action.id === 'video-editor-split-clip')?.disabled).toBe(true);
  expect(actions.find((action) => action.id === 'video-editor-duplicate-clip')?.disabled).toBe(
    true
  );
  expect(actions.find((action) => action.id === 'video-editor-delete-clip')?.disabled).toBe(true);
  expect(actions.find((action) => action.id === 'video-editor-delete-clip')?.disabledReason).toBe(
    translate('videoEditor.stage.noSelection')
  );
});

it('uses toggle subtitles for playback and diagnostics actions', () => {
  const controller = createPaletteController();
  controller.isPlaying = true;

  const actions = buildVideoEditorCommandPaletteActions(controller);

  expect(actions.find((action) => action.id === 'video-editor-toggle-playback')?.subtitle).toBe(
    translate('shared.ui.commandPaletteCurrentContextHint')
  );
  expect(actions.find((action) => action.id === 'video-editor-toggle-diagnostics')?.subtitle).toBe(
    translate('shared.ui.commandPaletteToggleHint')
  );
});
