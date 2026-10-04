import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorControllerInstance } from '../types';

const mocks = vi.hoisted(() => ({
  applyToolMode: vi.fn(),
  commitHistory: vi.fn(),
  refreshPreview: vi.fn(),
  scheduleZoomToFit: vi.fn(),
  setZoomCentered: vi.fn(),
  switchToSelect: vi.fn(),
  syncRuntimeState: vi.fn(),
  withHistoryMuted: vi.fn(),
  zoomToFit: vi.fn(),
}));

vi.mock('../../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/actions')>()),
  applyEditorControllerToolMode: mocks.applyToolMode,
  commitEditorHistory: mocks.commitHistory,
  scheduleEditorControllerZoomToFit: mocks.scheduleZoomToFit,
  switchEditorControllerToSelectTool: mocks.switchToSelect,
  syncEditorControllerRuntimeState: mocks.syncRuntimeState,
  withEditorHistoryMuted: mocks.withHistoryMuted,
}));

vi.mock('../actions/scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions/scene')>()),
  setZoomCenteredForController: mocks.setZoomCentered,
  zoomToFitForController: mocks.zoomToFit,
}));

vi.mock('../../tools/settings-preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/settings-preview')>()),
  refreshEditorToolSettingsPreview: mocks.refreshPreview,
}));

import {
  applyToolModeForController,
  commitHistoryForController,
  refreshActiveToolSettingsPreviewForController,
  scheduleZoomToFitForController,
  switchToSelectToolForController,
  syncRuntimeStateForController,
  withHistoryMutedForController,
} from './runtime';

beforeEach(() => vi.resetAllMocks());

it('mutes and restores controller history around an action', () => {
  const controller = { historyMuted: 0 } as EditorControllerInstance;
  mocks.withHistoryMuted.mockImplementation(({ getHistoryMuted, setHistoryMuted, callback }) => {
    const previous = getHistoryMuted();
    setHistoryMuted(previous + 1);
    const result = callback();
    setHistoryMuted(previous);
    return result;
  });

  const result = withHistoryMutedForController(controller, () => {
    expect(controller.historyMuted).toBe(1);
    return 'done';
  });

  expect(result).toBe('done');
  expect(controller.historyMuted).toBe(0);
});

it('exports one snapshot for history and autosave only when commit succeeds', () => {
  const snapshot = { id: 'saved' };
  const controller = {
    autosaveService: { scheduleAutosave: vi.fn() },
    exportDocument: vi.fn(() => snapshot),
    history: { id: 'history' },
    historyMuted: 0,
    syncRuntimeState: vi.fn(),
  } as unknown as EditorControllerInstance;
  mocks.commitHistory.mockImplementationOnce(({ exportDocument, syncRuntimeState }) => {
    expect(exportDocument()).toBe(snapshot);
    expect(exportDocument()).toBe(snapshot);
    syncRuntimeState();
    return true;
  });

  commitHistoryForController(controller);

  expect(controller.exportDocument).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  expect(controller.autosaveService?.scheduleAutosave).toHaveBeenCalledWith(snapshot);
  expect(mocks.commitHistory).toHaveBeenCalledWith(
    expect.objectContaining({ history: controller.history, historyMuted: false })
  );

  mocks.commitHistory.mockReturnValueOnce(false);
  commitHistoryForController(controller);
  expect(controller.autosaveService?.scheduleAutosave).toHaveBeenCalledOnce();
});

it('tracks the topmost selected layer and sends current viewport state to runtime', () => {
  const selected = { sniptaleId: 'selected' };
  const topmost = { sniptaleId: 'topmost' };
  const controller = {
    applyToolMode: vi.fn(),
    buildViewportState: vi.fn(() => ({ zoomPercent: 80 })),
    canvas: {
      getActiveObjects: vi.fn(() => [selected, topmost]),
      getObjects: vi.fn(() => [selected, topmost]),
    },
    cropGuide: null,
    cropSelection: null,
    history: null,
    lastLayerSelectionAnchorId: null,
  } as unknown as EditorControllerInstance;

  syncRuntimeStateForController(controller);

  expect(controller.lastLayerSelectionAnchorId).toBe('topmost');
  expect(mocks.syncRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas, viewportState: { zoomPercent: 80 } })
  );
  expect(controller.applyToolMode).toHaveBeenCalledOnce();

  controller.canvas = null;
  syncRuntimeStateForController(controller);
  expect(controller.lastLayerSelectionAnchorId).toBeNull();
});

it('passes tool mode and preview state to their owners', () => {
  const controller = {
    activeTool: 'crop',
    canvas: { id: 'canvas' },
    clearCropSelection: vi.fn(),
    cropGuide: { id: 'guide' },
    drawSession: { id: 'session' },
    toolModeEnabled: true,
  } as unknown as EditorControllerInstance;

  applyToolModeForController(controller);
  refreshActiveToolSettingsPreviewForController(controller);

  const modeOptions = mocks.applyToolMode.mock.calls[0]?.[0];
  expect(modeOptions).toMatchObject({
    activeTool: 'crop',
    canvas: controller.canvas,
    enabled: true,
    hasCropGuide: true,
  });
  modeOptions.clearCropSelection();
  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(mocks.refreshPreview).toHaveBeenCalledWith({
    activeTool: 'crop',
    canvas: controller.canvas,
    drawSession: controller.drawSession,
  });
});

it('switches to select through the tool-mode owner', () => {
  const controller = {
    activeTool: 'crop',
    applyToolMode: vi.fn(),
    toolModeEnabled: false,
  } as unknown as EditorControllerInstance;

  switchToSelectToolForController(controller);

  expect(controller.toolModeEnabled).toBe(true);
  const options = mocks.switchToSelect.mock.calls[0]?.[0];
  options.setActiveTool('select');
  options.applyToolMode();
  expect(controller.activeTool).toBe('select');
  expect(controller.applyToolMode).toHaveBeenCalledOnce();
});

it('uses the existing fit-to-window action after a document opens', () => {
  const controller = {} as EditorControllerInstance;

  scheduleZoomToFitForController(controller);

  expect(mocks.scheduleZoomToFit).toHaveBeenCalledOnce();
  const callback = mocks.scheduleZoomToFit.mock.calls[0]?.[0];
  expect(callback).toBeTypeOf('function');
  callback();

  expect(mocks.zoomToFit).toHaveBeenCalledExactlyOnceWith(controller);
  expect(mocks.setZoomCentered).not.toHaveBeenCalled();
});
