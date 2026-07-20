import { expect, it, vi } from 'vitest';

import { createRichShapeActionHandlers } from './builders';

it('routes rich-shape arrange actions through the selected controller methods', () => {
  const controller = {
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn(<T>(callback: () => T) => callback()),
  };
  const handlers = createRichShapeActionHandlers(controller as never);

  handlers.arrangeSelection('forward');
  handlers.arrangeSelection('backward');
  handlers.arrangeSelection('front');
  handlers.arrangeSelection('back');

  expect(controller.bringForwardSelection).toHaveBeenCalledOnce();
  expect(controller.sendBackwardSelection).toHaveBeenCalledOnce();
  expect(controller.bringSelectionToFront).toHaveBeenCalledOnce();
  expect(controller.sendSelectionToBack).toHaveBeenCalledOnce();
});
