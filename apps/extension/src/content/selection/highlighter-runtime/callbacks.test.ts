// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createHighlighterRuntimeState } from './state';
import {
  addHighlighterFrame,
  clearHighlighterFrames,
  registerHighlighterFrameCallbacks,
  removeHighlighterFrame,
} from './callbacks';

it('returns false until frame callbacks are registered', () => {
  const state = createHighlighterRuntimeState();

  expect(addHighlighterFrame(state, document.createElement('div'))).toBe(false);
  expect(removeHighlighterFrame(state, 'frame-1')).toBe(false);
  expect(clearHighlighterFrames(state)).toBe(false);
});

it('routes add, remove, and clear through the registered callbacks', () => {
  const state = createHighlighterRuntimeState();
  const addFrame = vi.fn();
  const removeFrame = vi.fn();
  const clearFrames = vi.fn();
  const hasFrameForElement = vi.fn();

  registerHighlighterFrameCallbacks(state, {
    addFrame,
    removeFrame,
    clearFrames,
    hasFrameForElement,
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
