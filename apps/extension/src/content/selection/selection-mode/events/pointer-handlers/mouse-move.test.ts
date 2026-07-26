// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { handleSelectionModeMouseMove } from '.';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';
import { resolveSelectionModePointerTarget } from './target';

vi.mock('./target', () => ({
  resolveSelectionModePointerTarget: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('starts drag selection after the threshold is crossed in hover mode', async () => {
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

it('skips DOM target resolution while drawing the selection rectangle', () => {
  const state = {
    currentState: 'drag',
    isActive: true,
  } as SelectionModeInteractionState;
  const options = {
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(),
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

  handleSelectionModeMouseMove({ clientX: 44, clientY: 55 } as MouseEvent, state, options);

  expect(options.updateDragSelection).toHaveBeenCalledWith(44, 55);
  expect(resolveSelectionModePointerTarget).not.toHaveBeenCalled();
});

it('skips DOM target resolution while moving a confirmed selection', () => {
  const state = {
    currentState: 'confirmed',
    isActive: true,
    isDragging: true,
    isResizing: false,
  } as SelectionModeInteractionState;
  const options = {
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(),
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
  const event = { clientX: 88, clientY: 99 } as MouseEvent;

  handleSelectionModeMouseMove(event, state, options);

  expect(options.handleDragMove).toHaveBeenCalledWith(event);
  expect(resolveSelectionModePointerTarget).not.toHaveBeenCalled();
});
