// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { handleSelectionModeMouseDown } from './mouse-down';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

vi.mock('./target', () => ({
  resolveSelectionModePointerTarget: vi.fn(),
}));

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  handleSelectionModeConfirmedMouseDown: vi.fn(),
  handleSelectionModeIdleMouseDown: vi.fn(),
}));

it('delegates idle pointer downs to the idle handler', async () => {
  const { resolveSelectionModePointerTarget } = await import('./target');
  const { handleSelectionModeIdleMouseDown } = await import('../helpers');
  const target = document.createElement('div');
  vi.mocked(resolveSelectionModePointerTarget).mockReturnValue(target);
  const state = { currentState: 'idle', isActive: true } as SelectionModeInteractionState;
  const options = {
    isExtensionUIElement: vi.fn(),
  } satisfies Pick<SelectionModeEventOptions, 'isExtensionUIElement'>;

  handleSelectionModeMouseDown(
    new MouseEvent('mousedown'),
    state,
    options as Pick<SelectionModeEventOptions, 'isExtensionUIElement'>
  );

  expect(handleSelectionModeIdleMouseDown).toHaveBeenCalledWith(
    expect.any(MouseEvent),
    state,
    options.isExtensionUIElement,
    target
  );
});
