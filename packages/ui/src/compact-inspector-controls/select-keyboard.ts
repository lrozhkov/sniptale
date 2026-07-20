import type { KeyboardEvent } from 'react';
import type { CompactSelectActions } from './select-actions';
import { getNextEnabledIndex } from './select-helpers';
import type { CompactSelectOption } from './select-types';

interface UseCompactSelectKeyboardParams<T extends string> {
  actions: CompactSelectActions<T>;
  activeStartIndex: number;
  open: boolean;
  options: readonly CompactSelectOption<T>[];
  selectedIndex: number;
  setOpen: (open: boolean) => void;
  triggerOnKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
}

export function useCompactSelectKeyboard<T extends string>({
  actions,
  activeStartIndex,
  open,
  options,
  selectedIndex,
  setOpen,
  triggerOnKeyDown,
}: UseCompactSelectKeyboardParams<T>) {
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    triggerOnKeyDown?.(event);
    if (!event.defaultPrevented) {
      handleCompactSelectTriggerKey({
        actions,
        activeStartIndex,
        event,
        open,
        options,
        selectedIndex,
        setOpen,
      });
    }
  };
  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    handleCompactSelectOptionKey({ actions, event, index, options });
  };

  return { handleOptionKeyDown, handleTriggerKeyDown };
}

function handleCompactSelectTriggerKey<T extends string>({
  actions,
  activeStartIndex,
  event,
  open,
  options,
  selectedIndex,
  setOpen,
}: UseCompactSelectKeyboardParams<T> & { event: KeyboardEvent<HTMLButtonElement> }) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    actions.openMenu(activeStartIndex);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    actions.openMenu(getNextEnabledIndex(options, selectedIndex >= 0 ? selectedIndex : 0, -1));
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    actions.openMenu(activeStartIndex);
  } else if (event.key === 'Escape') {
    setOpen(false);
  }
}

function handleCompactSelectOptionKey<T extends string>({
  actions,
  event,
  index,
  options,
}: {
  actions: CompactSelectActions<T>;
  event: KeyboardEvent<HTMLButtonElement>;
  index: number;
  options: readonly CompactSelectOption<T>[];
}) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    actions.focusOption(getNextEnabledIndex(options, index + 1, 1));
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    actions.focusOption(getNextEnabledIndex(options, index - 1, -1));
  } else {
    handleCompactSelectOptionCommand({ actions, event, index, options });
  }
}

function handleCompactSelectOptionCommand<T extends string>({
  actions,
  event,
  index,
  options,
}: {
  actions: CompactSelectActions<T>;
  event: KeyboardEvent<HTMLButtonElement>;
  index: number;
  options: readonly CompactSelectOption<T>[];
}) {
  if (event.key === 'Home') {
    event.preventDefault();
    actions.focusOption(getNextEnabledIndex(options, 0, 1));
  } else if (event.key === 'End') {
    event.preventDefault();
    actions.focusOption(getNextEnabledIndex(options, options.length - 1, -1));
  } else if (event.key === 'Escape') {
    event.preventDefault();
    actions.closeAndFocusTrigger();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectCompactOptionAtIndex(actions.selectOption, options, index);
  }
}

function selectCompactOptionAtIndex<T extends string>(
  selectOption: (option: CompactSelectOption<T>) => void,
  options: readonly CompactSelectOption<T>[],
  index: number
) {
  const option = options[index];
  if (option) {
    selectOption(option);
  }
}
