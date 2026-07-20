import { expect, it, vi } from 'vitest';
import { handleSelectionModeMouseUp } from './mouse-up';
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
  } satisfies Pick<SelectionModeEventOptions, 'finalizeDragSelection'>;

  handleSelectionModeMouseUp(state, options);

  expect(options.finalizeDragSelection).toHaveBeenCalledOnce();
  expect(logSelectionModeDragFinalize).toHaveBeenCalledWith(state);
  expect(state.mouseDownPoint).toBeNull();
});
