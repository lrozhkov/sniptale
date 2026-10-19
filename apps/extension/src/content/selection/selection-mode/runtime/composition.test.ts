// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import { getSelectionModeSizePanelCopy } from '../ui/constants';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { createSelectionModeSession } from '../session';
import type { SelectionModeRuntimeActionsArgs } from './setup';

const mocks = vi.hoisted(() => ({
  createDrawingRuntime: vi.fn(),
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

vi.mock('../ui/drawing', () => ({ createSelectionDrawingRuntime: mocks.createDrawingRuntime }));

vi.mock('../../frame-runtime/selection-frame-visual', () => ({
  getSelectionFrameVisual: mocks.getSelectionFrameVisual,
}));
vi.mock('../events/handlers', () => ({
  createSelectionModeEventHandlers: mocks.createEventHandlers,
}));
vi.mock('../events/bridge', () => ({
  createSelectionModeEventsBridge: mocks.createEventsBridge,
}));
vi.mock('../interaction/cursor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../interaction/cursor')>()),
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

  it('yields crop gestures while drawing and snapshots committed work before confirmation cleanup', async () => {
    let active = false;
    const snapshot = {
      objects: [],
      projection: { x: 0, y: 0 },
      viewport: { width: 1280, height: 560 },
    };
    const drawing = {
      attachToolbar: vi.fn(),
      isDrawing: () => active,
      finalize: vi.fn(() => snapshot),
      dispose: vi.fn(),
    };
    mocks.createDrawingRuntime.mockReturnValueOnce(drawing);
    mocks.enableSelectionModeApi.mockImplementationOnce(async (args) =>
      args.createOverlayContainer()
    );
    const scenario = createScenario();
    scenario.session.dom.overlayContainer = document.createElement('div');
    const onDrawingSnapshot = vi.fn();
    await scenario.runtime.enableSelectionMode({ onDrawingSnapshot });
    const setup = mocks.createRuntimeSetup.mock.calls[0]![0];
    const bridge = mocks.createEventsBridge.mock.calls[0]![0];
    const ui = mocks.createUiRuntime.mock.calls[0]![0];
    const mouse = new MouseEvent('mousedown');
    scenario.session.dom.finalOverlay = document.createElement('div');
    scenario.session.dom.sizeTooltip = createContentSizeTooltipDom({
      mountInto: scenario.session.dom.overlayContainer!,
      copy: getSelectionModeSizePanelCopy(),
      widthMin: 10,
      widthMax: 1280,
      heightMin: 10,
      heightMax: 560,
      maintainAspectRatio: false,
    });
    setup.createFinalElements();
    expect(scenario.session.dom.finalOverlay.style.zIndex).toBe('3');
    expect(drawing.attachToolbar).toHaveBeenCalledWith(scenario.session.dom.sizeTooltip);
    active = true;
    setup.handleClick(mouse);
    setup.handleMouseDown(mouse);
    setup.handleMouseMove(mouse);
    setup.handleMouseUp(mouse);
    setup.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    bridge.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    setup.handleDragStart(new Event('dragstart'));
    setup.handleMouseLeave();
    expect(scenario.handlers.handleClick).not.toHaveBeenCalled();
    expect(scenario.handlers.handleMouseDown).not.toHaveBeenCalled();
    expect(scenario.handlers.handleMouseMove).not.toHaveBeenCalled();
    expect(scenario.handlers.handleMouseUp).not.toHaveBeenCalled();
    expect(scenario.handlers.handleKeyDown).not.toHaveBeenCalled();
    active = false;
    setup.handleClick(mouse);
    setup.handleMouseDown(mouse);
    setup.handleMouseMove(mouse);
    setup.handleMouseUp(mouse);
    setup.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    bridge.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    setup.handleDragStart(new Event('dragstart'));
    setup.handleMouseLeave();
    expect(scenario.handlers.handleClick).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleMouseMove).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleMouseUp).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleKeyDown).toHaveBeenCalledTimes(2);
    expect(scenario.handlers.handleDragStart).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleMouseLeave).toHaveBeenCalledOnce();
    expect(scenario.handlers.handleMouseDown).toHaveBeenCalledOnce();
    ui.onConfirm();
    expect(onDrawingSnapshot).toHaveBeenCalledWith(snapshot);
    expect(drawing.finalize.mock.invocationCallOrder[0]).toBeLessThan(
      onDrawingSnapshot.mock.invocationCallOrder[0]!
    );
    expect(onDrawingSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      scenario.events.confirmSelection.mock.invocationCallOrder[0]!
    );
    scenario.runtime.cleanupEffects();
    expect(drawing.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      scenario.events.cleanup.mock.invocationCallOrder[0]!
    );
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
      selectionModeEvents: expect.objectContaining({
        ...scenario.events,
        confirmSelection: expect.any(Function),
      }),
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

it('mounts the frozen frame and disposes viewport invalidation with the session listeners', async () => {
  const scenario = createScenario();
  const container = document.createElement('div');
  const assertViewport = vi.fn();
  const cleanupListeners = vi.fn();
  scenario.session.dom.overlayContainer = container;
  scenario.session.frozenFrame = {
    dataUrl: 'data:image/png;base64,frame',
    geometry: {
      width: 1200,
      height: 800,
      scale: 1,
      getRect: vi.fn(),
      targetAt: vi.fn(),
      assertViewport,
    },
  };
  mocks.setupRuntimeListeners.mockImplementationOnce(() => {
    scenario.session.cleanupEventListeners = cleanupListeners;
  });
  mocks.enableSelectionModeApi.mockImplementationOnce(async (args) => {
    args.createOverlayContainer();
    args.setupEventListeners();
    return { x: 0, y: 0, width: 10, height: 10 };
  });
  await scenario.runtime.enableSelectionMode({ frozenFrame: scenario.session.frozenFrame });
  expect(container.querySelector('.sniptale-selection-frozen-frame')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
  assertViewport.mockImplementation(() => {
    throw new Error('viewport changed');
  });
  window.dispatchEvent(new Event('resize'));
  expect(scenario.events.cancelSelection).toHaveBeenCalledOnce();
  scenario.session.cleanupEventListeners?.();
  expect(cleanupListeners).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('resize'));
  expect(scenario.events.cancelSelection).toHaveBeenCalledOnce();
});
