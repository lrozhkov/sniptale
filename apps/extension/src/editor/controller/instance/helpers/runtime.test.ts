/* eslint-disable max-lines-per-function -- runtime helper regression test keeps controller helper paths together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeActionMocks = vi.hoisted(() => ({
  applyEditorControllerToolMode: vi.fn(),
  commitEditorHistory: vi.fn(() => true),
  scheduleEditorControllerZoomToFit: vi.fn((callback: () => void) => callback()),
  switchEditorControllerToSelectTool: vi.fn(({ applyToolMode, setActiveTool }) => {
    setActiveTool('select');
    applyToolMode();
  }),
  syncEditorControllerRuntimeState: vi.fn(),
  withEditorHistoryMuted: vi.fn(({ callback, getHistoryMuted, setHistoryMuted }) => {
    setHistoryMuted(getHistoryMuted() + 1);
    const result = callback();
    setHistoryMuted(getHistoryMuted() - 1);
    return result;
  }),
}));

const previewMocks = vi.hoisted(() => ({
  refreshEditorToolSettingsPreview: vi.fn(),
}));

const rasterSessionMocks = vi.hoisted(() => ({
  syncEditorRasterSelectionSession: vi.fn(),
}));

const sceneActionMocks = vi.hoisted(() => ({
  setZoomCenteredForController: vi.fn(),
}));

vi.mock('../../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/actions')>()),
  applyEditorControllerToolMode: runtimeActionMocks.applyEditorControllerToolMode,
  commitEditorHistory: runtimeActionMocks.commitEditorHistory,
  scheduleEditorControllerZoomToFit: runtimeActionMocks.scheduleEditorControllerZoomToFit,
  switchEditorControllerToSelectTool: runtimeActionMocks.switchEditorControllerToSelectTool,
  syncEditorControllerRuntimeState: runtimeActionMocks.syncEditorControllerRuntimeState,
  withEditorHistoryMuted: runtimeActionMocks.withEditorHistoryMuted,
}));

vi.mock('../../tools/settings-preview', () => ({
  refreshEditorToolSettingsPreview: previewMocks.refreshEditorToolSettingsPreview,
}));

vi.mock('../../raster-tools/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster-tools/session')>()),
  syncEditorRasterSelectionSession: rasterSessionMocks.syncEditorRasterSelectionSession,
}));

vi.mock('../actions/scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions/scene')>()),
  setZoomCenteredForController: sceneActionMocks.setZoomCenteredForController,
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

function createRuntimeController() {
  return {
    activeTool: 'crop',
    applyToolMode: vi.fn(),
    autosaveService: {
      scheduleAutosave: vi.fn(),
    },
    buildViewportState: vi.fn(() => ({ zoomPercent: 125 })),
    canvas: {
      getActiveObjects: vi.fn(() => []),
      getObjects: vi.fn(() => []),
      id: 'canvas',
    },
    clearCropSelection: vi.fn(),
    cropGuide: { kind: 'crop' },
    exportDocument: vi.fn(() => ({ version: 2 })),
    history: { push: vi.fn() },
    historyMuted: 0,
    navigateViewportTo: vi.fn(),
    setZoom: vi.fn(),
    toolModeEnabled: true,
    syncRuntimeState: vi.fn(),
    zoomToFit: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor controller runtime helpers', () => {
  it('propagates history, runtime sync, tool-mode, and zoom work through injected actions', async () => {
    const controller = createRuntimeController();

    const result = withHistoryMutedForController(controller as never, () => 'muted');
    commitHistoryForController(controller as never);
    syncRuntimeStateForController(controller as never);
    applyToolModeForController(controller as never);
    refreshActiveToolSettingsPreviewForController(controller as never);
    switchToSelectToolForController(controller as never);
    scheduleZoomToFitForController(controller as never);

    expect(result).toBe('muted');
    expect(controller.historyMuted).toBe(0);
    expect(runtimeActionMocks.withEditorHistoryMuted).toHaveBeenCalledOnce();
    expect(runtimeActionMocks.commitEditorHistory).toHaveBeenCalledWith({
      exportDocument: expect.any(Function),
      history: controller.history,
      historyMuted: false,
      syncRuntimeState: expect.any(Function),
    });
    const historyCall = runtimeActionMocks.commitEditorHistory.mock.calls.at(0) as
      | unknown[]
      | undefined;
    const historyArgs = historyCall?.[0] as {
      exportDocument: () => { version: number };
    };
    expect(historyArgs.exportDocument()).toEqual({ version: 2 });
    expect(historyArgs.exportDocument()).toEqual({ version: 2 });
    expect(controller.exportDocument).toHaveBeenCalledTimes(1);
    expect(controller.autosaveService.scheduleAutosave).toHaveBeenCalledWith({ version: 2 });
    expect(rasterSessionMocks.syncEditorRasterSelectionSession).toHaveBeenCalledWith({
      canvas: controller.canvas,
      session: undefined,
    });
    expect(runtimeActionMocks.syncEditorControllerRuntimeState).toHaveBeenCalledWith({
      canvas: controller.canvas,
      cropGuide: controller.cropGuide,
      history: controller.history,
      viewportState: { zoomPercent: 125 },
    });
    expect(controller.applyToolMode).toHaveBeenCalledTimes(2);
    expect(runtimeActionMocks.applyEditorControllerToolMode).toHaveBeenCalledWith({
      activeTool: 'crop',
      canvas: controller.canvas,
      clearCropSelection: expect.any(Function),
      enabled: true,
      hasCropGuide: true,
    });
    expect(previewMocks.refreshEditorToolSettingsPreview).toHaveBeenCalledWith({
      activeTool: 'crop',
      canvas: controller.canvas,
      drawSession: undefined,
    });
    expect(controller.activeTool).toBe('select');
    expect(sceneActionMocks.setZoomCenteredForController).toHaveBeenCalledWith(controller, 1);
    expect(controller.setZoom).not.toHaveBeenCalled();
    expect(controller.navigateViewportTo).not.toHaveBeenCalled();
    expect(controller.zoomToFit).not.toHaveBeenCalled();
  });

  it('passes history-muted state and clear-crop callbacks through controller wrappers', async () => {
    const controller = {
      ...createRuntimeController(),
      historyMuted: 2,
    };

    commitHistoryForController(controller as never);
    applyToolModeForController(controller as never);

    expect(runtimeActionMocks.commitEditorHistory).toHaveBeenLastCalledWith({
      exportDocument: expect.any(Function),
      history: controller.history,
      historyMuted: true,
      syncRuntimeState: expect.any(Function),
    });

    const toolModeArgs = runtimeActionMocks.applyEditorControllerToolMode.mock.calls.at(-1)?.[0];
    expect(toolModeArgs).toBeDefined();
    toolModeArgs?.clearCropSelection();
    expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  });

  it('skips autosave scheduling when history commit is ignored', async () => {
    runtimeActionMocks.commitEditorHistory.mockReturnValueOnce(false);
    const controller = createRuntimeController();

    commitHistoryForController(controller as never);

    expect(controller.exportDocument).not.toHaveBeenCalled();
    expect(controller.autosaveService.scheduleAutosave).not.toHaveBeenCalled();
  });

  it('handles crop-free tool mode and missing autosave service without side effects', async () => {
    const controller = {
      ...createRuntimeController(),
      autosaveService: null,
      cropGuide: null,
    };

    commitHistoryForController(controller as never);
    applyToolModeForController(controller as never);

    expect(runtimeActionMocks.applyEditorControllerToolMode).toHaveBeenCalledWith({
      activeTool: 'crop',
      canvas: controller.canvas,
      clearCropSelection: expect.any(Function),
      enabled: true,
      hasCropGuide: false,
    });
  });

  it('tracks the top-most selected layer id while syncing runtime state', async () => {
    const topObject = { sniptaleId: 'top-layer' };
    const otherObject = { sniptaleId: 'other-layer' };
    const controller = {
      ...createRuntimeController(),
      canvas: {
        getActiveObjects: vi.fn(() => [otherObject, topObject]),
        getObjects: vi.fn(() => [otherObject, topObject]),
      },
      lastLayerSelectionAnchorId: null,
      rasterToolSession: { selection: null },
    };

    syncRuntimeStateForController(controller as never);

    expect(controller.lastLayerSelectionAnchorId).toBe('top-layer');
    expect(runtimeActionMocks.syncEditorControllerRuntimeState).toHaveBeenCalledWith({
      canvas: controller.canvas,
      cropGuide: controller.cropGuide,
      history: controller.history,
      viewportState: { zoomPercent: 125 },
    });
  });
});
