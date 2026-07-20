import { expect, it, vi } from 'vitest';

import {
  createOptionKeyDownHandler,
  createTriggerKeyDownHandler,
  findAdjacentEnabledIndex,
  findBoundaryEnabledIndex,
  resolveOpenIndex,
} from './navigation';

function createKeyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLButtonElement>;
}

function createTriggerHandlers(options: Array<{ value: string; disabled?: boolean }>) {
  const closeMenu = vi.fn();
  const moveToAdjacent = vi.fn();
  const moveToBoundary = vi.fn();
  const openMenu = vi.fn();

  return {
    closeMenu,
    handleClosedKeyDown: createTriggerKeyDownHandler({
      closeMenu,
      isOpen: false,
      moveToAdjacent,
      moveToBoundary,
      openMenu,
      options,
      selectedIndex: 1,
    }),
    handleOpenKeyDown: createTriggerKeyDownHandler({
      closeMenu,
      isOpen: true,
      moveToAdjacent,
      moveToBoundary,
      openMenu,
      options,
      selectedIndex: 0,
    }),
    moveToAdjacent,
    moveToBoundary,
    openMenu,
  };
}

it('resolves enabled boundary and adjacent indexes', () => {
  const options = [
    { value: 'one', disabled: true },
    { value: 'two' },
    { value: 'three', disabled: true },
    { value: 'four' },
  ];

  expect(findBoundaryEnabledIndex(options, 'start')).toBe(1);
  expect(findBoundaryEnabledIndex(options, 'end')).toBe(3);
  expect(findAdjacentEnabledIndex(options, 1, 1)).toBe(3);
  expect(findAdjacentEnabledIndex(options, 3, -1)).toBe(1);
  expect(resolveOpenIndex(options, 3)).toBe(3);
  expect(resolveOpenIndex(options, 2)).toBe(1);
});

it('routes trigger keyboard events to the expected handlers', () => {
  const options = [{ value: 'one' }, { value: 'two', disabled: true }, { value: 'three' }];
  const {
    closeMenu,
    handleClosedKeyDown,
    handleOpenKeyDown,
    moveToAdjacent,
    moveToBoundary,
    openMenu,
  } = createTriggerHandlers(options);

  handleClosedKeyDown(createKeyboardEvent('ArrowDown'));
  handleClosedKeyDown(createKeyboardEvent('ArrowUp'));
  handleClosedKeyDown(createKeyboardEvent('Home'));
  handleClosedKeyDown(createKeyboardEvent('End'));
  handleClosedKeyDown(createKeyboardEvent('Enter'));
  handleClosedKeyDown(createKeyboardEvent(' '));

  expect(openMenu).toHaveBeenNthCalledWith(1, 0);
  expect(openMenu).toHaveBeenNthCalledWith(2, 2);
  expect(openMenu).toHaveBeenNthCalledWith(3, 0);
  expect(openMenu).toHaveBeenNthCalledWith(4, 2);
  expect(openMenu).toHaveBeenCalledTimes(6);

  handleOpenKeyDown(createKeyboardEvent('ArrowDown'));
  handleOpenKeyDown(createKeyboardEvent('ArrowUp'));
  handleOpenKeyDown(createKeyboardEvent('Home'));
  handleOpenKeyDown(createKeyboardEvent('End'));
  handleOpenKeyDown(createKeyboardEvent('Escape'));

  expect(moveToAdjacent).toHaveBeenNthCalledWith(1, 1, 'start');
  expect(moveToAdjacent).toHaveBeenNthCalledWith(2, -1, 'end');
  expect(moveToBoundary).toHaveBeenNthCalledWith(1, 'start');
  expect(moveToBoundary).toHaveBeenNthCalledWith(2, 'end');
  expect(closeMenu).toHaveBeenCalledWith(true);
});

it('routes option keyboard events to navigation and close handlers', () => {
  const closeMenu = vi.fn();
  const moveToBoundary = vi.fn();
  const setActiveIndex = vi.fn();
  const options = [{ value: 'one' }, { value: 'two', disabled: true }, { value: 'three' }];
  const handleOptionKeyDown = createOptionKeyDownHandler({
    closeMenu,
    moveToBoundary,
    options,
    setActiveIndex,
  })(0);

  handleOptionKeyDown(createKeyboardEvent('ArrowDown'));
  handleOptionKeyDown(createKeyboardEvent('ArrowUp'));
  handleOptionKeyDown(createKeyboardEvent('Home'));
  handleOptionKeyDown(createKeyboardEvent('End'));
  handleOptionKeyDown(createKeyboardEvent('Escape'));
  handleOptionKeyDown(createKeyboardEvent('Tab'));

  expect(setActiveIndex).toHaveBeenNthCalledWith(1, 2);
  expect(setActiveIndex).toHaveBeenNthCalledWith(2, 0);
  expect(moveToBoundary).toHaveBeenNthCalledWith(1, 'start');
  expect(moveToBoundary).toHaveBeenNthCalledWith(2, 'end');
  expect(closeMenu).toHaveBeenNthCalledWith(1, true);
  expect(closeMenu).toHaveBeenNthCalledWith(2, false);
});
