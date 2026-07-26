// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  createHighlighterFrameActions,
  createHighlighterInvalidateActions,
  createHighlighterInputActions,
  createHighlighterRuntimeActions,
  createHighlighterStateActions,
} from './controller.actions';
import { createHighlighterRuntimeState } from './state';
import { createHoverControllerStub, createLoggerStub } from './controller.test-support';

it('routes runtime lifecycle through the injected owner and clears hover UI on dispose', () => {
  const hoverController = createHoverControllerStub();
  const state = createHighlighterRuntimeState();
  const enableRuntime = vi.fn();
  const disableRuntime = vi.fn();
  const logIframeCount = vi.fn();
  const actions = createHighlighterRuntimeActions({
    disableRuntime,
    enableRuntime,
    hoverController,
    logIframeCount,
    state,
  });

  actions.enableMode();
  actions.disableMode();
  actions.dispose();

  expect(enableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(disableRuntime).toHaveBeenCalledTimes(2);
  expect(logIframeCount).toHaveBeenCalledTimes(1);
  expect(hoverController.cancelPendingHoverFrame).toHaveBeenCalledTimes(1);
  expect(hoverController.clearHoverTracking).toHaveBeenCalledTimes(1);
  expect(hoverController.removeHoverOverlay).toHaveBeenCalledTimes(1);
  expect(hoverController.removeOverlayContainer).toHaveBeenCalledTimes(1);
});

it('warns when frame actions run before callbacks are registered', () => {
  const hoverController = createHoverControllerStub();
  const logger = createLoggerStub();
  const actions = createHighlighterFrameActions({
    hoverController,
    logger,
    state: createHighlighterRuntimeState(),
  });

  actions.addHighlight(document.createElement('div'));
  actions.removeHighlight('frame-1');
  actions.clearAllHighlights();

  expect(hoverController.createOverlayContainer).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledTimes(3);
  expect(hoverController.removeHoverOverlay).toHaveBeenCalledTimes(1);
  expect(hoverController.removeOverlayContainer).toHaveBeenCalledTimes(1);
});

it('registers callbacks and routes frame actions through them', () => {
  const addFrame = vi.fn();
  const removeFrame = vi.fn();
  const addFreeFrame = vi.fn();
  const clearFrames = vi.fn();
  const hasFrameForElement = vi.fn();
  const logger = createLoggerStub();
  const actions = createHighlighterFrameActions({
    hoverController: createHoverControllerStub(),
    logger,
    state: createHighlighterRuntimeState(),
  });

  actions.registerFrameCallbacks(
    addFrame,
    addFreeFrame,
    removeFrame,
    clearFrames,
    hasFrameForElement
  );
  actions.addHighlight(document.createElement('div'));
  actions.removeHighlight('frame-1');
  actions.clearAllHighlights();

  expect(addFrame).toHaveBeenCalledTimes(1);
  expect(removeFrame).toHaveBeenCalledWith('frame-1');
  expect(clearFrames).toHaveBeenCalledTimes(1);
  expect(logger.warn).not.toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledWith('Frame callbacks registered');
});

it('owns pause and editing state transitions', () => {
  const state = createHighlighterRuntimeState();
  const hoverController = createHoverControllerStub();
  const actions = createHighlighterStateActions({
    hoverController,
    logger: createLoggerStub(),
    state,
  });

  actions.pause();
  actions.setFrameEditing();
  expect(actions.isPausedState()).toBe(true);

  actions.resume();
  actions.clearFrameEditing();
  expect(actions.isPausedState()).toBe(false);
  expect(actions.isEnabled()).toBe(false);
});

it('routes cache invalidation to the hover owner', () => {
  const hoverController = createHoverControllerStub();
  const actions = createHighlighterInvalidateActions(hoverController);

  actions.invalidateFrameCache();

  expect(hoverController.invalidateFrameCache).toHaveBeenCalledTimes(1);
});

it('keeps click suppression under the hover input owner', () => {
  const hoverController = createHoverControllerStub();
  hoverController.consumeSuppressedClick.mockReturnValueOnce(true);
  const click = { type: 'click' } as MouseEvent;
  const actions = createHighlighterInputActions(hoverController);

  expect(actions.consumeSuppressedClick(click)).toBe(true);
  expect(hoverController.consumeSuppressedClick).toHaveBeenCalledWith(click);
});
