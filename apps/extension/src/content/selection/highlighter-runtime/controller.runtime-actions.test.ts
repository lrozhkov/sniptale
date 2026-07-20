import { expect, it, vi } from 'vitest';
import { createHighlighterRuntimeState } from './state';
import { createHighlighterRuntimeActions } from './controller.runtime-actions';
import { createHoverControllerStub } from './controller.test.helpers';

it('delegates enable and disable to the injected runtime helpers', () => {
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

  expect(enableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(disableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(logIframeCount).toHaveBeenCalledTimes(1);
});

it('disposes the runtime and clears hover UI state', () => {
  const hoverController = createHoverControllerStub();
  const disableRuntime = vi.fn();
  const actions = createHighlighterRuntimeActions({
    disableRuntime,
    enableRuntime: vi.fn(),
    hoverController,
    logIframeCount: vi.fn(),
    state: createHighlighterRuntimeState(),
  });

  actions.dispose();

  expect(disableRuntime).toHaveBeenCalledTimes(1);
  expect(hoverController.cancelPendingHoverFrame).toHaveBeenCalledTimes(1);
  expect(hoverController.clearHoverTracking).toHaveBeenCalledTimes(1);
  expect(hoverController.removeHoverOverlay).toHaveBeenCalledTimes(1);
  expect(hoverController.removeOverlayContainer).toHaveBeenCalledTimes(1);
});
