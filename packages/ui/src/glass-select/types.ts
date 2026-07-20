import type { ReactNode } from 'react';

export interface GlassSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  groupLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface GlassSelectProps<T extends string = string> {
  value: T | '';
  onChange: (value: T) => void;
  options: GlassSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  size?: 'sm' | 'md';
  portal?: boolean;
  variant?: 'default' | 'popup-flat';
  dataUi?: string;
  'aria-label'?: string;
}
