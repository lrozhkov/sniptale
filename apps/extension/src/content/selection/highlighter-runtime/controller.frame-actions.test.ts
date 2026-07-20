// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createHighlighterRuntimeState } from './state';
import { createHighlighterFrameActions } from './controller.frame-actions';
import { createHoverControllerStub, createLoggerStub } from './controller.test.helpers';

it('warns when frame callbacks are missing', () => {
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

it('registers frame callbacks and routes highlight actions through them', () => {
  const addFrame = vi.fn();
  const removeFrame = vi.fn();
  const clearFrames = vi.fn();
  const hasFrameForElement = vi.fn();
  const logger = createLoggerStub();
  const actions = createHighlighterFrameActions({
    hoverController: createHoverControllerStub(),
    logger,
    state: createHighlighterRuntimeState(),
  });

  actions.registerFrameCallbacks(addFrame, removeFrame, clearFrames, hasFrameForElement);
  actions.addHighlight(document.createElement('div'));
  actions.removeHighlight('frame-1');
  actions.clearAllHighlights();

  expect(addFrame).toHaveBeenCalledTimes(1);
  expect(removeFrame).toHaveBeenCalledWith('frame-1');
  expect(clearFrames).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith('Frame callbacks registered');
  expect(logger.log).toHaveBeenCalledWith('All highlights cleared');
});

it('registers frame callbacks without the optional hasFrameForElement guard', () => {
  const addFrame = vi.fn();
  const removeFrame = vi.fn();
  const clearFrames = vi.fn();
  const logger = createLoggerStub();
  const actions = createHighlighterFrameActions({
    hoverController: createHoverControllerStub(),
    logger,
    state: createHighlighterRuntimeState(),
  });

  actions.registerFrameCallbacks(addFrame, removeFrame, clearFrames);
  actions.addHighlight(document.createElement('div'));

  expect(addFrame).toHaveBeenCalledTimes(1);
  expect(logger.warn).not.toHaveBeenCalled();
});
