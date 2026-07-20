import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { resolveRangeVisualStyle } from '../range-control/style';
import { joinClassNames } from './helpers';

export interface ProductGlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export interface ProductGlassChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  stacked?: boolean;
}

export interface ProductGlassMiniButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export interface ProductGlassSwitchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
}

export type ProductGlassRangeProps = InputHTMLAttributes<HTMLInputElement>;

export type ProductGlassInputProps = InputHTMLAttributes<HTMLInputElement>;

export interface ProductGlassBoldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export interface ProductGlassDestructiveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export const ProductGlassIconButton = forwardRef<HTMLButtonElement, ProductGlassIconButtonProps>(
  function ProductGlassIconButton(
    { active = false, className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-icon-button',
          active && 'sniptale-glass-icon-button--active',
          className
        )}
        {...props}
      />
    );
  }
);

export const ProductGlassChip = forwardRef<HTMLButtonElement, ProductGlassChipProps>(
  function ProductGlassChip(
    { active = false, stacked = false, className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-chip',
          stacked && 'sniptale-glass-chip--stacked',
          active && 'sniptale-glass-chip--active',
          className
        )}
        {...props}
      />
    );
  }
);

export const ProductGlassMiniButton = forwardRef<HTMLButtonElement, ProductGlassMiniButtonProps>(
  function ProductGlassMiniButton(
    { active = false, className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-mini-button',
          active && 'sniptale-glass-mini-button--active',
          className
        )}
        {...props}
      />
    );
  }
);

export const ProductGlassSwitch = forwardRef<HTMLButtonElement, ProductGlassSwitchProps>(
  function ProductGlassSwitch(
    { on = false, className = '', type = 'button', children, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-switch',
          on && 'sniptale-glass-switch--on',
          className
        )}
        {...props}
      >
        {children ?? <span className="sniptale-glass-switch-thumb" />}
      </button>
    );
  }
);

export const ProductGlassRange = forwardRef<HTMLInputElement, ProductGlassRangeProps>(
  function ProductGlassRange(
    { className = '', defaultValue, max, min, style, type = 'range', value, ...props },
    ref
  ) {
    return (
      <input
        {...props}
        ref={ref}
        type={type}
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        className={joinClassNames('sniptale-glass-range', className)}
        style={resolveRangeVisualStyle({ defaultValue, max, min, style, value })}
      />
    );
  }
);

export function ProductGlassRangeMeta({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={joinClassNames('sniptale-glass-range-meta', className)} {...props}>
      {children}
    </div>
  );
}

export const ProductGlassInput = forwardRef<HTMLInputElement, ProductGlassInputProps>(
  function ProductGlassInput({ className = '', ...props }, ref) {
    return (
      <input ref={ref} className={joinClassNames('sniptale-glass-input', className)} {...props} />
    );
  }
);

export const ProductGlassBoldButton = forwardRef<HTMLButtonElement, ProductGlassBoldButtonProps>(
  function ProductGlassBoldButton(
    { active = false, className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-bold-button',
          active && 'sniptale-glass-bold-button--active',
          className
        )}
        {...props}
      />
    );
  }
);

export const ProductGlassDestructiveButton = forwardRef<
  HTMLButtonElement,
  ProductGlassDestructiveButtonProps
>(function ProductGlassDestructiveButton({ className = '', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={joinClassNames('sniptale-glass-destructive', className)}
      {...props}
    />
  );
});
