// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { handleSelectionModeMouseMove } from './mouse-move';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

vi.mock('./target', () => ({
  resolveSelectionModePointerTarget: vi.fn(),
}));

it('starts drag selection after the threshold is crossed in hover mode', async () => {
  const { resolveSelectionModePointerTarget } = await import('./target');
  const target = document.createElement('section');
  vi.mocked(resolveSelectionModePointerTarget).mockReturnValue(target);
  const state = {
    currentState: 'hover',
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: false,
    mouseDownPoint: { x: 10, y: 20 },
  } as SelectionModeInteractionState;
  const options = {
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(() => false),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
  } satisfies Pick<
    SelectionModeEventOptions,
    | 'handleDragMove'
    | 'handleResizeMove'
    | 'hideHoverFrame'
    | 'isExtensionUIElement'
    | 'showHoverFrame'
    | 'startDragSelection'
    | 'updateDragSelection'
  >;

  handleSelectionModeMouseMove({ clientX: 18, clientY: 29 } as MouseEvent, state, options);

  expect(options.showHoverFrame).toHaveBeenCalledWith(target, undefined);
  expect(options.startDragSelection).toHaveBeenCalledWith(10, 20);
});
