import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { joinClassNames } from './helpers';

export interface ProductGlassPresetListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  scrollable?: boolean;
  variant?: 'card' | 'menu';
}

export interface ProductGlassPresetItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  showActiveIndicator?: boolean;
}

export function ProductGlassPresetList({
  children,
  className = '',
  scrollable = false,
  variant = 'card',
  ...props
}: ProductGlassPresetListProps) {
  return (
    <div
      className={joinClassNames(
        'sniptale-glass-preset-list',
        scrollable && 'sniptale-glass-preset-list--scroll',
        variant === 'menu' && 'sniptale-glass-preset-list--menu',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export const ProductGlassPresetItem = forwardRef<HTMLButtonElement, ProductGlassPresetItemProps>(
  function ProductGlassPresetItem(
    {
      active = false,
      children,
      className = '',
      showActiveIndicator = false,
      type = 'button',
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClassNames(
          'sniptale-glass-preset-item',
          active && 'sniptale-glass-preset-item--active',
          className
        )}
        {...props}
      >
        {children}
        {active && showActiveIndicator ? (
          <Check aria-hidden="true" className="sniptale-glass-preset-check" />
        ) : null}
      </button>
    );
  }
);

export function ProductGlassPresetPreview({
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={joinClassNames('sniptale-glass-preset-preview', className)} {...props} />;
}

export function ProductGlassPresetMeta({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={joinClassNames('sniptale-glass-preset-meta', className)} {...props}>
      {children}
    </span>
  );
}

export const ProductGlassPresetName = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function ProductGlassPresetName({ children, className = '', ...props }, ref) {
    return (
      <span
        ref={ref}
        className={joinClassNames('sniptale-glass-preset-name', className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);
