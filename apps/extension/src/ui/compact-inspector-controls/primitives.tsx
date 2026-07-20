import React from 'react';

import {
  ProductInput,
  ProductRange,
  ProductTextarea,
  type ProductInputProps,
  type ProductRangeProps,
  type ProductTextareaProps,
} from '@sniptale/ui/product-form-controls';
import {
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_SOLID_CONTROL_CLASS_NAME,
  resolveCompactInspectorInteractiveControlStyle,
} from './interactive-control-style';
import { cx } from './shared';
export type { ProductTextareaProps as CompactTextareaProps } from '@sniptale/ui/product-form-controls';
export { CompactSelect } from './select';
export type { CompactSelectOption, CompactSelectProps } from './select';

const COMPACT_COLOR_OPTION_FOCUS_CLASS_NAME = [
  'focus-visible:outline-none',
  'focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_26%,transparent)]',
].join(' ');
const COMPACT_COLOR_OPTION_ACTIVE_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_66%,var(--sniptale-color-border-soft)_34%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-surface-panel)_52%,transparent)]',
].join('');

export interface CompactColorOptionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const CompactInput = React.forwardRef<HTMLInputElement, ProductInputProps>(
  function CompactInput({ className, ...props }, ref) {
    return (
      <ProductInput
        ref={ref}
        {...props}
        className={cx(
          'h-10 px-3 text-sm leading-5',
          COMPACT_INSPECTOR_SOLID_CONTROL_CLASS_NAME,
          className
        )}
      />
    );
  }
);

export const CompactTextarea = React.forwardRef<HTMLTextAreaElement, ProductTextareaProps>(
  function CompactTextarea({ className, ...props }, ref) {
    return (
      <ProductTextarea
        ref={ref}
        {...props}
        data-ui="shared.ui.compact-textarea"
        className={cx(
          'min-h-[6.875rem] w-full resize-y px-3 py-2 text-sm leading-5 outline-none',
          COMPACT_INSPECTOR_SOLID_CONTROL_CLASS_NAME,
          className
        )}
      />
    );
  }
);

export const CompactRange = React.forwardRef<HTMLInputElement, ProductRangeProps>(
  function CompactRange({ className, style, ...props }, ref) {
    return (
      <ProductRange
        ref={ref}
        {...props}
        className={cx('w-full', COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME, className)}
        style={resolveCompactInspectorInteractiveControlStyle(style)}
      />
    );
  }
);

export function CompactColorOption({
  active = false,
  className,
  type,
  ...props
}: CompactColorOptionProps) {
  return (
    <button
      type={type ?? 'button'}
      {...props}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border transition',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_90%,transparent)]',
        'bg-[color:var(--sniptale-color-surface-panel)]',
        'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-surface-panel)_52%,transparent)]',
        'hover:-translate-y-px hover:border-[color:var(--sniptale-color-border-strong)]',
        COMPACT_COLOR_OPTION_FOCUS_CLASS_NAME,
        active && COMPACT_COLOR_OPTION_ACTIVE_CLASS_NAME,
        className
      )}
    />
  );
}
