import type { ButtonHTMLAttributes, KeyboardEvent, MutableRefObject, ReactNode, Ref } from 'react';

export interface ProductSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ProductSelectProps<T extends string = string> extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onChange' | 'value'
> {
  value: T | '';
  onChange: (value: T) => void;
  options: readonly ProductSelectOption<T>[];
  placeholder?: string;
  controlSize?: 'sm' | 'md';
  containerClassName?: string;
  menuClassName?: string;
  dataUi?: string;
}

export interface ProductSelectTriggerProps<T extends string = string> {
  ariaLabel: string | undefined;
  ariaControls: string;
  className: string;
  controlSize: 'sm' | 'md';
  disabled: boolean;
  isOpen: boolean;
  onKeyDown: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onKeyDown']>;
  onToggle: () => void;
  placeholder: string | undefined;
  selectedOption: ProductSelectOption<T> | undefined;
  triggerProps: Omit<
    ProductSelectProps<T>,
    | 'containerClassName'
    | 'controlSize'
    | 'dataUi'
    | 'menuClassName'
    | 'onChange'
    | 'options'
    | 'placeholder'
    | 'value'
  >;
  triggerRef: Ref<HTMLButtonElement>;
}

export interface ProductSelectMenuProps<T extends string = string> {
  controlSize: 'sm' | 'md';
  menuClassName: string;
  menuId: string;
  menuPosition: 'bottom' | 'top';
  menuRef: MutableRefObject<HTMLDivElement | null>;
  onOptionKeyDown: (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => void;
  onOptionMouseEnter: (index: number) => void;
  onSelect: (option: ProductSelectOption<T>) => void;
  options: readonly ProductSelectOption<T>[];
  optionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  value: T | '';
}
