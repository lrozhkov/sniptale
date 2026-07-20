import { expect, it, vi } from 'vitest';
import { handleSelectionModeMouseLeave } from './mouse-leave';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

vi.mock('../../diag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diag')>()),
  logSelectionModeRuntime: vi.fn(),
}));

it('hides the hover frame when the pointer leaves from idle or hover state', async () => {
  const { logSelectionModeRuntime } = await import('../../diag');
  const state = { currentState: 'hover', isActive: true } as SelectionModeInteractionState;
  const options = {
    hideHoverFrame: vi.fn(),
  } satisfies Pick<SelectionModeEventOptions, 'hideHoverFrame'>;

  handleSelectionModeMouseLeave(state, options);

  expect(options.hideHoverFrame).toHaveBeenCalledOnce();
  expect(logSelectionModeRuntime).toHaveBeenCalledWith(
    'Hover preview hidden - cursor left viewport'
  );
});
