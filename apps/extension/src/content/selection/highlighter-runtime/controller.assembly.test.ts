import { expect, it, vi } from 'vitest';
import { createHighlighterControllerBindings } from './controller.assembly';

it('composes controller ownership from state, hover, runtime, frame, and state seams', () => {
  const state = { isModeEnabled: false };
  const hoverController = {
    invalidateFrameCache: vi.fn(),
    invalidateSettingsCache: vi.fn(),
  };
  const createState = vi.fn(() => state as never);
  const createHoverController = vi.fn(() => hoverController as never);
  const enableRuntime = vi.fn();
  const disableRuntime = vi.fn((runtimeState) => {
    runtimeState.isModeEnabled = false;
  });
  const logAccessibleIframeCount = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn() };

  const controller = createHighlighterControllerBindings({
    createHoverController,
    createState,
    disableRuntime,
    enableRuntime,
    logAccessibleIframeCount,
    logger,
  });

  controller.enableMode();
  controller.disableMode();
  controller.invalidateFrameCache();
  controller.invalidateSettingsCache();

  expect(createState).toHaveBeenCalledTimes(1);
  expect(createHoverController).toHaveBeenCalledTimes(1);
  expect(enableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(disableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(logAccessibleIframeCount).toHaveBeenCalledTimes(1);
  expect(hoverController.invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(hoverController.invalidateSettingsCache).toHaveBeenCalledTimes(1);
});
