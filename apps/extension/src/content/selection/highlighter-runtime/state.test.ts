// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  addHighlighterFrame,
  clearHighlighterFrames,
  createHighlighterCallbacks,
  createHighlighterRuntimeState,
  createHighlighterStateGetters,
  registerHighlighterFrameCallbacks,
  removeHighlighterFrame,
  resetHighlighterHoverUi,
  suspendHighlighterCreationUi,
} from './state';
import { createHoverControllerStub } from './controller.test-support';

it('creates a fresh runtime state with cleared callbacks and flags', () => {
  expect(createHighlighterRuntimeState()).toEqual({
    callbacks: {
      addFrame: null,
      addFreeFrame: null,
      clearFrames: null,
      hasFrameForElement: null,
      removeFrame: null,
    },
    cleanupEventListeners: null,
    isCreationEnabled: true,
    isFrameEditing: false,
    isModeEnabled: false,
    isPaused: false,
  });
});

it('exposes live callback and state accessors to the hover owner', () => {
  const state = createHighlighterRuntimeState();
  const addFrame = vi.fn();
  const hasFrameForElement = vi.fn();
  const addFreeFrame = vi.fn();
  state.callbacks.addFrame = addFrame;
  state.callbacks.addFreeFrame = addFreeFrame;
  state.callbacks.hasFrameForElement = hasFrameForElement;
  state.isModeEnabled = true;
  state.isPaused = true;
  state.isFrameEditing = true;

  expect(createHighlighterCallbacks(state)()).toEqual({
    addFrame,
    addFreeFrame,
    hasFrameForElement,
  });
  expect(createHighlighterStateGetters(state).isModeEnabled()).toBe(true);
  expect(createHighlighterStateGetters(state).isPaused()).toBe(true);
  expect(createHighlighterStateGetters(state).isFrameEditing()).toBe(true);

  state.isPaused = false;
  state.isCreationEnabled = false;
  expect(createHighlighterStateGetters(state).isPaused()).toBe(true);
});

it('returns false until frame callbacks are registered', () => {
  const state = createHighlighterRuntimeState();

  expect(addHighlighterFrame(state, document.createElement('div'))).toBe(false);
  expect(removeHighlighterFrame(state, 'frame-1')).toBe(false);
  expect(clearHighlighterFrames(state)).toBe(false);
});

it('routes frame operations through registered callbacks', () => {
  const state = createHighlighterRuntimeState();
  const addFrame = vi.fn();
  const removeFrame = vi.fn();
  const clearFrames = vi.fn();
  const hasFrameForElement = vi.fn();
  const addFreeFrame = vi.fn();
  registerHighlighterFrameCallbacks(state, {
    addFrame,
    addFreeFrame,
    clearFrames,
    hasFrameForElement,
    removeFrame,
  });
  const element = document.createElement('div');

  expect(addHighlighterFrame(state, element)).toBe(true);
  expect(removeHighlighterFrame(state, 'frame-1')).toBe(true);
  expect(clearHighlighterFrames(state)).toBe(true);
  expect(state.callbacks.hasFrameForElement).toBe(hasFrameForElement);
  expect(addFrame).toHaveBeenCalledWith(element);
  expect(removeFrame).toHaveBeenCalledWith('frame-1');
  expect(clearFrames).toHaveBeenCalledTimes(1);
});

it('applies the shared hover teardown policy', () => {
  const hoverController = createHoverControllerStub();

  resetHighlighterHoverUi(hoverController);

  expect(hoverController.cancelPendingHoverFrame).toHaveBeenCalledTimes(1);
  expect(hoverController.cancelDrawing).toHaveBeenCalledWith('teardown');
  expect(hoverController.clearHoverTracking).toHaveBeenCalledTimes(1);
  expect(hoverController.removeHoverOverlay).toHaveBeenCalledTimes(1);
  expect(hoverController.removeOverlayContainer).toHaveBeenCalledTimes(1);
});

it('suspends creation without removing the reusable hover runtime', () => {
  const hoverController = createHoverControllerStub();

  suspendHighlighterCreationUi(hoverController);

  expect(hoverController.cancelDrawing).toHaveBeenCalledWith('teardown');
  expect(hoverController.cancelPendingHoverFrame).toHaveBeenCalledOnce();
  expect(hoverController.clearHoverTracking).toHaveBeenCalledOnce();
  expect(hoverController.hideHoverOverlay).toHaveBeenCalledOnce();
  expect(hoverController.removeHoverOverlay).not.toHaveBeenCalled();
  expect(hoverController.removeOverlayContainer).not.toHaveBeenCalled();
});
