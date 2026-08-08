// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { handleSelectionModeMouseUp } from '.';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

vi.mock('../../diag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diag')>()),
  logSelectionModeDragFinalize: vi.fn(),
  logSelectionModePointerFinish: vi.fn(),
}));

it('finalizes a drag and clears pointer state on mouse up', async () => {
  const { logSelectionModeDragFinalize } = await import('../../diag');
  const state = {
    currentState: 'drag',
    hasMovedEnough: true,
    isActive: true,
    mouseDownPoint: { x: 20, y: 30 },
  } as SelectionModeInteractionState;
  const options = {
    finalizeDragSelection: vi.fn(),
    flushFinalFrameUpdate: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
  } satisfies Pick<
    SelectionModeEventOptions,
    'finalizeDragSelection' | 'flushFinalFrameUpdate' | 'startDragSelection' | 'updateDragSelection'
  >;

  const event = new MouseEvent('mouseup', { cancelable: true });
  const preventDefault = vi.spyOn(event, 'preventDefault');

  handleSelectionModeMouseUp(event, state, options);

  expect(options.finalizeDragSelection).toHaveBeenCalledOnce();
  expect(logSelectionModeDragFinalize).toHaveBeenCalledWith(state);
  expect(state.mouseDownPoint).toBeNull();
  expect(preventDefault).toHaveBeenCalledOnce();
});
