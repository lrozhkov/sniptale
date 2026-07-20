import { expect, it } from 'vitest';
import { createHighlighterRuntimeState } from './state';
import { createHighlighterStateActions } from './controller.state-actions';
import { createHoverControllerStub, createLoggerStub } from './controller.test.helpers';

it('tracks pause and frame-editing state on the runtime owner', () => {
  const state = createHighlighterRuntimeState();
  const actions = createHighlighterStateActions({
    hoverController: createHoverControllerStub(),
    logger: createLoggerStub(),
    state,
  });

  actions.pause();
  actions.setFrameEditing();
  actions.resume();
  actions.clearFrameEditing();

  expect(actions.isPausedState()).toBe(false);
  expect(actions.isFrameTooltipVisible()).toBe(false);
  expect(actions.isEnabled()).toBe(false);
  expect(state.isFrameEditing).toBe(false);
});

it('toggles tooltip visibility through the hover controller', () => {
  const hoverController = createHoverControllerStub();
  const actions = createHighlighterStateActions({
    hoverController,
    logger: createLoggerStub(),
    state: createHighlighterRuntimeState(),
  });

  actions.setFrameTooltipVisible();
  actions.clearFrameTooltipVisible();

  expect(actions.isFrameTooltipVisible()).toBe(false);
  expect(hoverController.hideHoverOverlay).toHaveBeenCalledTimes(1);
  expect(hoverController.clearHoverTracking).toHaveBeenCalledTimes(1);
});
