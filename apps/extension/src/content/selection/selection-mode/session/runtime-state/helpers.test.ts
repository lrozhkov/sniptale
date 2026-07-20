import { expect, it, vi } from 'vitest';

const {
  createSelectionModeCoreStateMock,
  createSelectionModeInteractionStateMock,
  createSelectionModePointerStateMock,
  mergeSelectionModeRuntimeStateMock,
} = vi.hoisted(() => ({
  createSelectionModeCoreStateMock: vi.fn(),
  createSelectionModeInteractionStateMock: vi.fn(),
  createSelectionModePointerStateMock: vi.fn(),
  mergeSelectionModeRuntimeStateMock: vi.fn(),
}));

vi.mock('./core', () => ({
  createSelectionModeCoreState: createSelectionModeCoreStateMock,
}));
vi.mock('.', () => ({
  createSelectionModePointerState: createSelectionModePointerStateMock,
}));
vi.mock('./flags', () => ({
  createSelectionModeInteractionState: createSelectionModeInteractionStateMock,
}));
vi.mock('./merge', () => ({
  mergeSelectionModeRuntimeState: mergeSelectionModeRuntimeStateMock,
}));

import { createSelectionModeRuntimeState } from './helpers';
import { createMutableRefs } from './test-support';

it('composes the runtime-state slices through the facade without wrapping them', () => {
  const refs = createMutableRefs();
  const coreState = { core: true } as never;
  const pointerState = { pointer: true } as never;
  const interactionState = { interaction: true } as never;
  const mergedState = { merged: true } as never;

  createSelectionModeCoreStateMock.mockReturnValue(coreState);
  createSelectionModePointerStateMock.mockReturnValue(pointerState);
  createSelectionModeInteractionStateMock.mockReturnValue(interactionState);
  mergeSelectionModeRuntimeStateMock.mockReturnValue(mergedState);

  expect(createSelectionModeRuntimeState(refs)).toBe(mergedState);
  expect(createSelectionModeCoreStateMock).toHaveBeenCalledWith(refs);
  expect(createSelectionModePointerStateMock).toHaveBeenCalledWith(refs);
  expect(createSelectionModeInteractionStateMock).toHaveBeenCalledWith(refs);
  expect(mergeSelectionModeRuntimeStateMock).toHaveBeenCalledWith(
    coreState,
    pointerState,
    interactionState
  );
});
