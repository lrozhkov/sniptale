import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export type ProductToolbarMenuPlacement = 'down' | 'up' | 'side';

export interface ProductToolbarMenuProps {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
  placement?: ProductToolbarMenuPlacement;
  variant?: 'default' | 'viewport' | 'capture';
}

export interface ProductToolbarMenuItemProps {
  children: ReactNode;
  className?: string;
  dataUi?: string;
  disabled?: boolean;
  selected?: boolean;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
}

export interface ProductToolbarMenuItemCopyProps {
  label: ReactNode;
  hint?: ReactNode;
}

export interface ProductToolbarMenuBadgeProps {
  children: ReactNode;
  className?: string;
}

/**
 * Canonical toolbar popover menu used for viewport and capture quick-switch flows.
 */
export function ProductToolbarMenu({
  children,
  title,
  className = '',
  style,
  compact = false,
  placement = 'down',
  variant = 'default',
}: ProductToolbarMenuProps) {
  const resolvedClassName = [
    'sniptale-popover-menu',
    'sniptale-toolbar-menu',
    compact ? 'sniptale-toolbar-menu--compact' : '',
    placement === 'up' ? 'sniptale-popover-up' : '',
    placement === 'side' ? 'sniptale-popover-side' : '',
    variant === 'viewport' ? 'sniptale-viewport-menu' : '',
    variant === 'capture' ? 'sniptale-capture-menu' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={resolvedClassName} style={style}>
      {title ? <div className="sniptale-toolbar-menu-title">{title}</div> : null}
      <div className="sniptale-toolbar-menu-list">{children}</div>
    </div>
  );
}

export function ProductToolbarMenuItem({
  children,
  className = '',
  dataUi,
  disabled = false,
  selected = false,
  onMouseDown,
  onClick,
  type = 'button',
}: ProductToolbarMenuItemProps) {
  const resolvedClassName = [
    'sniptale-popover-item',
    'sniptale-toolbar-menu-item',
    selected ? 'sniptale-popover-item-selected' : '',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      data-ui={dataUi}
      disabled={disabled}
      className={resolvedClassName}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ProductToolbarMenuItemCopy({ label, hint }: ProductToolbarMenuItemCopyProps) {
  return (
    <span className="sniptale-toolbar-menu-item-copy">
      <span className="sniptale-toolbar-menu-item-label">{label}</span>
      {hint ? <span className="sniptale-toolbar-menu-item-hint">{hint}</span> : null}
    </span>
  );
}

export function ProductToolbarMenuBadge({
  children,
  className = '',
}: ProductToolbarMenuBadgeProps) {
  return (
    <span className={['sniptale-toolbar-menu-item-badge', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

export function ProductToolbarMenuDivider() {
  return <div className="sniptale-popover-divider" />;
}
