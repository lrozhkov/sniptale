// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const sessionModule = vi.hoisted(() => {
  const session = { owner: 'hover-session' };
  return {
    createHoverSession: vi.fn(() => session),
    invalidateHighlighterSettings: vi.fn(),
    invalidateHoverFrameCache: vi.fn(),
    session,
  };
});
const overlayModule = vi.hoisted(() => {
  const actions = {
    createHoverOverlay: vi.fn(),
    createOverlayContainer: vi.fn(),
    hideHoverOverlay: vi.fn(),
    removeHoverOverlay: vi.fn(),
    removeOverlayContainer: vi.fn(),
    showHoverOverlay: vi.fn(),
  };
  return { actions, createHoverOverlayActions: vi.fn(() => actions) };
});
const interactionModule = vi.hoisted(() => {
  const handlers = {
    cancelPendingHoverFrame: vi.fn(),
    clearHoverTracking: vi.fn(),
    handleClick: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
  };
  return { createHoverInteractionHandlers: vi.fn(() => handlers), handlers };
});
const frameModule = vi.hoisted(() => ({
  getAccessibleIframes: vi.fn(() => [document.createElement('iframe')]),
}));
const drawingModule = vi.hoisted(() => {
  const handlers = {
    cancelDrawing: vi.fn(() => false),
    consumeSuppressedClick: vi.fn(() => false),
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
  };
  return { createFreeFrameDrawingHandlers: vi.fn(() => handlers), handlers };
});
const logger = vi.hoisted(() => ({ log: vi.fn() }));

vi.mock('./session', () => sessionModule);
vi.mock('./overlay', () => overlayModule);
vi.mock('./interactions', () => interactionModule);
vi.mock('./drawing', () => drawingModule);
vi.mock('../../platform/frame', () => frameModule);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => logger),
}));

import { createHighlighterHoverController, logAccessibleIframeCount } from '.';

afterEach(() => {
  vi.clearAllMocks();
});

function createStateGetters() {
  return {
    isFrameEditing: () => false,
    isModeEnabled: () => true,
    isPaused: () => false,
    isTooltipVisible: () => false,
  };
}

describe('highlighter hover preview controller', () => {
  it('composes one session behind the stable twelve-method facade', () => {
    const getCallbacks = () => ({
      addFrame: vi.fn(),
      addFreeFrame: vi.fn(),
      hasFrameForElement: vi.fn(() => false),
    });
    const getState = createStateGetters();

    const controller = createHighlighterHoverController(getCallbacks, getState);

    expect(Object.keys(controller).sort()).toEqual(
      ['input', 'invalidation', 'overlay', 'tracking'].sort()
    );
    expect(sessionModule.createHoverSession).toHaveBeenCalledOnce();
    expect(overlayModule.createHoverOverlayActions).toHaveBeenCalledWith(sessionModule.session);
    expect(interactionModule.createHoverInteractionHandlers).toHaveBeenCalledWith({
      getCallbacks,
      getState,
      hoverThrottleMs: 100,
      overlayActions: overlayModule.actions,
      session: sessionModule.session,
      consumeSuppressedClick: drawingModule.handlers.consumeSuppressedClick,
    });
    expect(drawingModule.createFreeFrameDrawingHandlers).toHaveBeenCalledWith({
      getCallbacks,
      getState,
      hideHoverOverlay: overlayModule.actions.hideHoverOverlay,
      session: sessionModule.session,
    });
  });

  it('routes lifecycle, cache, and pointer operations to their explicit owners', () => {
    const controller = createHighlighterHoverController(
      () => ({ addFrame: null, addFreeFrame: null, hasFrameForElement: null }),
      createStateGetters()
    );
    const event = new MouseEvent('mousemove');
    const iframe = document.createElement('iframe');
    const detail = { defaultBorderPresetId: 'preset-2' };

    controller.overlay.createContainer();
    controller.overlay.removeContainer();
    controller.overlay.createPreview();
    controller.overlay.removePreview();
    controller.overlay.hidePreview();
    controller.invalidation.frameCache();
    controller.invalidation.settingsCache(detail);
    controller.input.mouseMove(event, iframe);
    controller.input.mouseLeave();
    controller.input.click(event, iframe);
    controller.tracking.cancelPendingFrame();
    controller.tracking.clear();
    controller.input.cancelDrawing();

    expect(overlayModule.actions.createOverlayContainer).toHaveBeenCalledOnce();
    expect(overlayModule.actions.removeOverlayContainer).toHaveBeenCalledOnce();
    expect(overlayModule.actions.createHoverOverlay).toHaveBeenCalledOnce();
    expect(overlayModule.actions.removeHoverOverlay).toHaveBeenCalledOnce();
    expect(overlayModule.actions.hideHoverOverlay).toHaveBeenCalledOnce();
    expect(sessionModule.invalidateHoverFrameCache).toHaveBeenCalledWith(sessionModule.session);
    expect(sessionModule.invalidateHighlighterSettings).toHaveBeenCalledWith(
      sessionModule.session,
      detail
    );
    expect(interactionModule.handlers.handleMouseMove).toHaveBeenCalledWith(event, iframe);
    expect(interactionModule.handlers.handleMouseLeave).toHaveBeenCalledOnce();
    expect(interactionModule.handlers.handleClick).toHaveBeenCalledWith(event, iframe);
    expect(interactionModule.handlers.cancelPendingHoverFrame).toHaveBeenCalledOnce();
    expect(interactionModule.handlers.clearHoverTracking).toHaveBeenCalledOnce();
    expect(drawingModule.handlers.cancelDrawing).toHaveBeenCalledOnce();
  });

  it('logs the accessible iframe count', () => {
    logAccessibleIframeCount();

    expect(logger.log).toHaveBeenCalledWith('Highlighter mode enabled', { accessibleIframes: 1 });
  });
});
