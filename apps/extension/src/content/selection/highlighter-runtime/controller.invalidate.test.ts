import { expect, it, vi } from 'vitest';
import { createHighlighterControllerInvalidateCallbacks } from './controller.invalidate';

it('delegates invalidate callbacks to the owning hover controller', () => {
  const hoverController = {
    invalidateFrameCache: vi.fn(),
    invalidateSettingsCache: vi.fn(),
  };

  const callbacks = createHighlighterControllerInvalidateCallbacks(hoverController);

  callbacks.invalidateFrameCache();
  callbacks.invalidateSettingsCache();

  expect(hoverController.invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(hoverController.invalidateSettingsCache).toHaveBeenCalledTimes(1);
});
