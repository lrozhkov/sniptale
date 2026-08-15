// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { createSelectionModeSession } from '../session';
import type { SelectionModeRuntimeActionsArgs } from './setup';

const mocks = vi.hoisted(() => ({
  createEventHandlers: vi.fn(),
  createEventsBridge: vi.fn(),
  createRuntimeSetup: vi.fn(),
  createSizePanelSetup: vi.fn(),
  createUiRuntime: vi.fn(),
  disableCursor: vi.fn(),
  disableSelectionModeApi: vi.fn(),
  enableCursor: vi.fn(),
  enableSelectionModeApi: vi.fn(),
  getSelectionFrameVisual: vi.fn(),
  isSelectionModeActiveApi: vi.fn(),
  setupRuntimeListeners: vi.fn(),
}));

vi.mock('../../frame-runtime/selection-frame-visual', () => ({
  getSelectionFrameVisual: mocks.getSelectionFrameVisual,
}));
vi.mock('../events/handlers', () => ({
  createSelectionModeEventHandlers: mocks.createEventHandlers,
}));
vi.mock('../events/bridge', () => ({
  createSelectionModeEventsBridge: mocks.createEventsBridge,
}));
vi.mock('../interaction/cursor', () => ({
  disableSelectionModeCursor: mocks.disableCursor,
  enableSelectionModeCursor: mocks.enableCursor,
}));
vi.mock('../events/listeners', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events/listeners')>()),
  setupSelectionModeRuntimeListeners: mocks.setupRuntimeListeners,
}));
vi.mock('../public-api', () => ({
  disableSelectionModeApi: mocks.disableSelectionModeApi,
  enableSelectionModeApi: mocks.enableSelectionModeApi,
  isSelectionModeActiveApi: mocks.isSelectionModeActiveApi,
}));
vi.mock('../ui/runtime', () => ({
  createSelectionModeUiRuntime: mocks.createUiRuntime,
}));
vi.mock('../ui/size-panel/runtime', () => ({
  createSelectionModeSizePanelSetup: mocks.createSizePanelSetup,
}));
vi.mock('./setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./setup')>()),
  createSelectionModeRuntimeSetup: mocks.createRuntimeSetup,
}));

import { createSelectionModeRuntime } from './composition';

function createScenario() {
  const session = createSelectionModeSession();
  const cleanup = vi.fn();
  const setupSizePanelListeners = vi.fn();
  const uiRuntime = {
    createDragFrame: vi.fn(),
    createFinalElements: vi.fn(),
    createHoverElements: vi.fn(),
    createOverlayContainer: vi.fn(),
    prepare: vi.fn(async () => undefined),
  };
  const handlers = {
    handleClick: vi.fn(),
    handleDragStart: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  };
  const runtimeArgs: SelectionModeRuntimeActionsArgs = {
    createDragFrame: vi.fn(),
    getAbsolutePosition: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
    getMaxSelectionHeight: vi.fn(() => 720),
    getMaxSelectionWidth: vi.fn(() => 1280),
    flushFinalFrameUpdate: vi.fn(),
    hideHoverFrame: vi.fn(),
    minSelectionSize: 10,
    scheduleFinalFrameUpdate: vi.fn(),
    setupListenerHandlers: handlers,
    showFinalFrame: vi.fn(),
    showHoverFrameDom: vi.fn(),
    state: session,
    updateFinalFrame: vi.fn(),
    zIndexBase: 2_147_483_644,
  };
  const events = {
    cancelSelection: vi.fn(),
    cleanup: vi.fn(),
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
  const visual: ResolvedBorderPresetVisual = {
    customCss: '',
    customCssStyles: {},
    fillColor: '#00000000',
    fillCss: '#00000000',
    id: 'selection-frame',
    inheritCustomCss: false,
    padding: { bottom: 0, left: 0, right: 0, top: 0 },
    radius: 0,
    shadow: 0,
    strokeColor: '#2563eb',
    strokeStyle: 'solid',
    strokeWidth: 2,
  };

  mocks.createSizePanelSetup.mockReturnValue(setupSizePanelListeners);
  mocks.createUiRuntime.mockReturnValue(uiRuntime);
  mocks.createRuntimeSetup.mockReturnValue(runtimeArgs);
  mocks.createEventsBridge.mockReturnValue(events);
  mocks.createEventHandlers.mockReturnValue(handlers);
  mocks.getSelectionFrameVisual.mockReturnValue(visual);

  const runtime = createSelectionModeRuntime({ cleanup, session });
  return {
    cleanup,
    events,
    handlers,
    runtime,
    runtimeArgs,
    session,
    setupSizePanelListeners,
    uiRuntime,
    visual,
  };
}

describe('selection-mode runtime composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles one session authority behind a narrow runtime contract', () => {
    const scenario = createScenario();
    const sizePanelArgs = mocks.createSizePanelSetup.mock.calls[0]?.[0];
    const uiArgs = mocks.createUiRuntime.mock.calls[0]?.[0];
    const setupArgs = mocks.createRuntimeSetup.mock.calls[0]?.[0];
    const bridgeArgs = mocks.createEventsBridge.mock.calls[0]?.[0];

    expect(Object.keys(scenario.runtime).sort()).toEqual([
      'cleanupEffects',
      'disableSelectionMode',
      'enableSelectionMode',
      'isSelectionModeActive',
    ]);
    expect(sizePanelArgs?.session).toBe(scenario.session);
    expect(setupArgs?.session).toBe(scenario.session);
    expect(bridgeArgs?.runtimeArgs).toBe(scenario.runtimeArgs);
    expect(mocks.createEventHandlers).toHaveBeenCalledWith({
      selectionModeEvents: scenario.events,
      state: scenario.session,
    });

    sizePanelArgs?.constrainSelection();
    sizePanelArgs?.updateFinalFrame();
    uiArgs?.onCancel();
    scenario.session.currentSelection = { x: 20, y: 20, width: 100, height: 80 };
    const onCaptureActionChange = vi.fn();
    scenario.session.onCaptureActionChange = onCaptureActionChange;
    uiArgs?.onAdjustPadding('increase');
    uiArgs?.onCaptureActionChange('copy');
    uiArgs?.onConfirm();
    uiArgs?.onResetToIdle();
    expect(uiArgs?.getDom()).toBe(scenario.session.dom);
    expect(uiArgs?.getCaptureAction()).toBe('copy');
    expect(uiArgs?.getSelection()).toEqual({ x: 15, y: 15, width: 110, height: 90 });
    expect(uiArgs?.getVisual()).toBe(scenario.visual);
    setupArgs?.handleKeyDown(new KeyboardEvent('keydown'));
    bridgeArgs?.handleKeyDown(new KeyboardEvent('keydown'));
    bridgeArgs?.disableCursor();
    scenario.runtime.cleanupEffects();

    expect(scenario.events.constrainSelection).toHaveBeenCalledOnce();
    expect(scenario.events.updateFinalFrame).toHaveBeenCalledTimes(2);
    expect(onCaptureActionChange).toHaveBeenCalledWith('copy');
    expect(scenario.events.cancelSelection).toHaveBeenCalledOnce();
    expect(scenario.events.confirmSelection).toHaveBeenCalledOnce();
    expect(scenario.events.resetToIdleState).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleKeyDown).toHaveBeenCalledTimes(2);
    expect(mocks.disableCursor).toHaveBeenCalledWith(scenario.session);
    expect(scenario.events.cleanup).toHaveBeenCalledOnce();
  });

  it('keeps public lifecycle ordering and adapters attached to the same composition', async () => {
    const area = { x: 10, y: 20, width: 300, height: 200 };
    mocks.enableSelectionModeApi.mockImplementation(async (args) => {
      await args.prepareUi();
      args.createOverlayContainer();
      args.createHoverElements();
      args.enableCursor();
      args.setupEventListeners();
      return area;
    });
    mocks.isSelectionModeActiveApi.mockReturnValue(true);
    const scenario = createScenario();

    const options = { captureAction: 'copy' as const, onCaptureActionChange: vi.fn() };
    await expect(scenario.runtime.enableSelectionMode(options)).resolves.toEqual(area);
    await expect(scenario.runtime.enableSelectionMode()).resolves.toEqual(area);
    scenario.runtime.disableSelectionMode();
    expect(scenario.runtime.isSelectionModeActive()).toBe(true);

    expect(mocks.enableSelectionModeApi).toHaveBeenCalledWith(
      expect.objectContaining({ cleanup: scenario.cleanup, options, session: scenario.session })
    );
    const enableWithoutOptionsArgs = mocks.enableSelectionModeApi.mock.calls[1]?.[0];
    expect(enableWithoutOptionsArgs).not.toHaveProperty('options');
    expect(scenario.uiRuntime.prepare).toHaveBeenCalledTimes(2);
    expect(scenario.uiRuntime.createOverlayContainer).toHaveBeenCalledTimes(2);
    expect(scenario.uiRuntime.createHoverElements).toHaveBeenCalledTimes(2);
    expect(mocks.enableCursor).toHaveBeenCalledWith(scenario.session);
    expect(mocks.setupRuntimeListeners).toHaveBeenCalledWith({
      hideHoverFrame: scenario.runtimeArgs.hideHoverFrame,
      session: scenario.session,
      setupListenerHandlers: scenario.runtimeArgs.setupListenerHandlers,
    });
    expect(mocks.disableSelectionModeApi).toHaveBeenCalledWith({
      cleanup: scenario.cleanup,
      session: scenario.session,
    });
    expect(mocks.isSelectionModeActiveApi).toHaveBeenCalledWith(scenario.session.isActive);
  });
});
