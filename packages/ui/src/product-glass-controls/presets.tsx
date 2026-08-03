import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './helpers';

export interface ProductGlassPresetListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  scrollable?: boolean;
}

export interface ProductGlassPresetItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function ProductGlassPresetList({
  children,
  className = '',
  scrollable = false,
  ...props
}: ProductGlassPresetListProps) {
  return (
    <div
      className={joinClassNames(
        'sniptale-glass-preset-list',
        scrollable && 'sniptale-glass-preset-list--scroll',
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
    { active = false, className = '', type = 'button', ...props },
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
      />
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
