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

it('starts drag selection without resolving or measuring page DOM after pointer down', async () => {
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

  handleSelectionModeMouseMove(
    new MouseEvent('mousemove', { cancelable: true, clientX: 18, clientY: 29 }),
    state,
    options
  );

  expect(resolveSelectionModePointerTarget).not.toHaveBeenCalled();
  expect(options.showHoverFrame).not.toHaveBeenCalled();
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

  const event = new MouseEvent('mousemove', {
    cancelable: true,
    clientX: 44,
    clientY: 55,
  });
  const preventDefault = vi.spyOn(event, 'preventDefault');
  const stopPropagation = vi.spyOn(event, 'stopPropagation');
  const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

  handleSelectionModeMouseMove(event, state, options);

  expect(options.updateDragSelection).toHaveBeenCalledWith(44, 55);
  expect(resolveSelectionModePointerTarget).not.toHaveBeenCalled();
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(stopImmediatePropagation).toHaveBeenCalledOnce();
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
  const event = new MouseEvent('mousemove', {
    cancelable: true,
    clientX: 88,
    clientY: 99,
  });

  handleSelectionModeMouseMove(event, state, options);

  expect(options.handleDragMove).toHaveBeenCalledWith(event);
  expect(resolveSelectionModePointerTarget).not.toHaveBeenCalled();
});
