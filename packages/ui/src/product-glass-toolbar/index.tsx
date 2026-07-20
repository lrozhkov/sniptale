import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export interface ProductGlassToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface ProductGlassToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  menuIndicator?: boolean;
}

/**
 * Canonical glass toolbar surface for quick-edit floating actions.
 */
export function ProductGlassToolbar({
  children,
  className = '',
  ...props
}: ProductGlassToolbarProps) {
  const resolvedClassName = ['sniptale-glass-toolbar', className].filter(Boolean).join(' ');
  return (
    <div className={resolvedClassName} {...props}>
      {children}
    </div>
  );
}

export const ProductGlassToolbarButton = forwardRef<
  HTMLButtonElement,
  ProductGlassToolbarButtonProps
>(function ProductGlassToolbarButton(
  {
    children,
    className = '',
    active = false,
    danger = false,
    menuIndicator = false,
    type = 'button',
    ...props
  },
  ref
) {
  const resolvedClassName = [
    'sniptale-glass-toolbar-button',
    active ? 'sniptale-glass-toolbar-button--active' : '',
    danger ? 'sniptale-glass-toolbar-button--danger' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={resolvedClassName}
      data-menu-indicator={menuIndicator ? 'true' : undefined}
      {...props}
    >
      {children}
    </button>
  );
});

export function ProductGlassToolbarDivider() {
  return <div className="sniptale-glass-toolbar-divider" />;
}
