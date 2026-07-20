import type { KeyboardEvent, MutableRefObject, Ref } from 'react';

export function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export function getProductSelectTriggerClassName(args: {
  className: string;
  controlSize: 'sm' | 'md';
  disabled: boolean;
  isOpen: boolean;
}) {
  return joinClassNames(
    'sniptale-select',
    args.controlSize === 'sm' && 'sniptale-select-sm',
    args.disabled && 'sniptale-select-disabled',
    args.isOpen && 'sniptale-select-open',
    args.className
  );
}

export function getProductSelectMenuClassName(args: {
  controlSize: 'sm' | 'md';
  menuClassName: string;
  menuPosition: 'bottom' | 'top';
}) {
  return joinClassNames(
    'sniptale-select-menu',
    args.controlSize === 'sm' && 'sniptale-select-menu-sm',
    args.menuPosition === 'top' && 'sniptale-select-menu-top',
    args.menuClassName
  );
}

export function getProductSelectOptionClassName(args: {
  controlSize: 'sm' | 'md';
  isDisabled: boolean;
  isSelected: boolean;
}) {
  return joinClassNames(
    'sniptale-select-option',
    args.controlSize === 'sm' && 'sniptale-select-option-sm',
    args.isSelected && 'sniptale-select-option-selected',
    args.isDisabled && 'sniptale-select-option-disabled'
  );
}

export function getProductSelectShellClassName(
  controlSize: 'sm' | 'md',
  containerClassName: string
) {
  return joinClassNames(
    'sniptale-select-shell',
    controlSize === 'sm' && 'sniptale-select-shell-sm',
    containerClassName
  );
}

function setButtonRef(ref: Ref<HTMLButtonElement>, node: HTMLButtonElement | null) {
  if (typeof ref === 'function') {
    ref(node);
    return;
  }

  if (ref) {
    (ref as MutableRefObject<HTMLButtonElement | null>).current = node;
  }
}

export function createProductSelectTriggerKeyDown(
  onKeyDown: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined,
  handleTriggerKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);

    if (!event.defaultPrevented) {
      handleTriggerKeyDown(event);
    }
  };
}

export function createProductSelectTriggerRef(
  ref: Ref<HTMLButtonElement>,
  setTriggerRef: (node: HTMLButtonElement | null) => void
) {
  return (node: HTMLButtonElement | null) => {
    setTriggerRef(node);
    setButtonRef(ref, node);
  };
}
