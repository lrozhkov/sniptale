import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './helpers';

export interface ProductGlassChipIconProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export interface ProductGlassColorTriggerProps extends HTMLAttributes<HTMLLabelElement> {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export interface ProductGlassColorOptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function ProductGlassChipIcon({
  children,
  className = '',
  ...props
}: ProductGlassChipIconProps) {
  return (
    <span className={joinClassNames('sniptale-glass-chip-icon', className)} {...props}>
      {children}
    </span>
  );
}

export function ProductGlassColorTrigger({
  active = false,
  disabled = false,
  children,
  className = '',
  ...props
}: ProductGlassColorTriggerProps) {
  return (
    <label
      className={joinClassNames(
        'sniptale-glass-color-trigger',
        active && 'sniptale-glass-color-trigger--active',
        disabled && 'sniptale-glass-color-trigger--disabled',
        className
      )}
      aria-disabled={disabled}
      {...props}
    >
      {children}
    </label>
  );
}

export const ProductGlassColorOption = forwardRef<HTMLButtonElement, ProductGlassColorOptionProps>(
  function ProductGlassColorOption(
    { active = false, className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-color-option',
          active && 'sniptale-glass-color-option--active',
          className
        )}
        {...props}
      />
    );
  }
);
