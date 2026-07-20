import { expect, it, vi } from 'vitest';
import {
  createHighlighterCallbacks,
  createHighlighterStateGetters,
  resolveHighlighterRuntimeDeps,
} from './controller.types';
import { createHighlighterRuntimeState } from './state';

it('builds callback and state getter accessors from runtime state', () => {
  const state = createHighlighterRuntimeState();
  const addFrame = vi.fn();
  const hasFrameForElement = vi.fn();

  state.callbacks.addFrame = addFrame;
  state.callbacks.hasFrameForElement = hasFrameForElement;
  state.isModeEnabled = true;
  state.isPaused = true;
  state.isFrameEditing = true;
  state.isTooltipVisible = true;

  expect(createHighlighterCallbacks(state)()).toEqual({ addFrame, hasFrameForElement });
  expect(createHighlighterStateGetters(state).isModeEnabled()).toBe(true);
  expect(createHighlighterStateGetters(state).isPaused()).toBe(true);
  expect(createHighlighterStateGetters(state).isFrameEditing()).toBe(true);
  expect(createHighlighterStateGetters(state).isTooltipVisible()).toBe(true);
});

it('resolves injected runtime dependencies before falling back to defaults', () => {
  const disableRuntime = vi.fn();
  const enableRuntime = vi.fn();
  const logAccessibleIframeCount = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn() };

  expect(
    resolveHighlighterRuntimeDeps({
      disableRuntime,
      enableRuntime,
      logAccessibleIframeCount,
      logger,
    })
  ).toEqual({
    disableRuntime,
    enableRuntime,
    logIframeCount: logAccessibleIframeCount,
    logger,
  });

  expect(resolveHighlighterRuntimeDeps({}).logger).toEqual(
    expect.objectContaining({
      log: expect.any(Function),
      warn: expect.any(Function),
    })
  );
});
