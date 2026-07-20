import type { KeyboardEvent } from 'react';

export interface ProductSelectControllerOption {
  disabled?: boolean;
  value: string;
}

export function findBoundaryEnabledIndex(
  options: readonly ProductSelectControllerOption[],
  direction: 'start' | 'end'
) {
  const start = direction === 'start' ? 0 : options.length - 1;
  const step = direction === 'start' ? 1 : -1;

  for (let index = start; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

export function findAdjacentEnabledIndex(
  options: readonly ProductSelectControllerOption[],
  currentIndex: number,
  direction: 1 | -1
) {
  for (
    let index = currentIndex + direction;
    index >= 0 && index < options.length;
    index += direction
  ) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return currentIndex;
}

export function resolveOpenIndex(
  options: readonly ProductSelectControllerOption[],
  selectedIndex: number
) {
  if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
    return selectedIndex;
  }

  return findBoundaryEnabledIndex(options, 'start');
}

export function createTriggerKeyDownHandler(args: {
  closeMenu: (restoreFocus?: boolean) => void;
  isOpen: boolean;
  moveToAdjacent: (direction: 1 | -1, fallback: 'start' | 'end') => void;
  moveToBoundary: (direction: 'start' | 'end') => void;
  openMenu: (nextIndex?: number) => void;
  options: readonly ProductSelectControllerOption[];
  selectedIndex: number;
}) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (args.isOpen) {
        args.moveToAdjacent(1, 'start');
      } else {
        args.openMenu(resolveOpenIndex(args.options, args.selectedIndex));
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleArrowUpKey(args);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      handleBoundaryKey(args, event.key === 'Home' ? 'start' : 'end');
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && !args.isOpen) {
      event.preventDefault();
      args.openMenu();
      return;
    }

    if (event.key === 'Escape' && args.isOpen) {
      event.preventDefault();
      args.closeMenu(true);
    }
  };
}

export function createOptionKeyDownHandler(args: {
  closeMenu: (restoreFocus?: boolean) => void;
  moveToBoundary: (direction: 'start' | 'end') => void;
  options: readonly ProductSelectControllerOption[];
  setActiveIndex: (index: number) => void;
}) {
  return (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      args.setActiveIndex(
        findAdjacentEnabledIndex(args.options, index, event.key === 'ArrowDown' ? 1 : -1)
      );
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      args.moveToBoundary(event.key === 'Home' ? 'start' : 'end');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      args.closeMenu(true);
      return;
    }

    if (event.key === 'Tab') {
      args.closeMenu(false);
    }
  };
}

function handleArrowUpKey(args: {
  isOpen: boolean;
  moveToAdjacent: (direction: 1 | -1, fallback: 'start' | 'end') => void;
  openMenu: (nextIndex?: number) => void;
  options: readonly ProductSelectControllerOption[];
  selectedIndex: number;
}) {
  if (args.isOpen) {
    args.moveToAdjacent(-1, 'end');
    return;
  }

  if (args.selectedIndex >= 0 && !args.options[args.selectedIndex]?.disabled) {
    args.openMenu(args.selectedIndex);
    return;
  }

  args.openMenu(findBoundaryEnabledIndex(args.options, 'end'));
}

function handleBoundaryKey(
  args: {
    isOpen: boolean;
    moveToBoundary: (direction: 'start' | 'end') => void;
    openMenu: (nextIndex?: number) => void;
    options: readonly ProductSelectControllerOption[];
  },
  direction: 'start' | 'end'
) {
  if (args.isOpen) {
    args.moveToBoundary(direction);
    return;
  }

  args.openMenu(findBoundaryEnabledIndex(args.options, direction));
}
