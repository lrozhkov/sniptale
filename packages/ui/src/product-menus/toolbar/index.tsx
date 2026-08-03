import type { CSSProperties, FocusEventHandler, MouseEventHandler, ReactNode } from 'react';
import { useFloatingSurfaceWheelContainment } from '../../floating-interactions/wheel';

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
  ariaDescribedBy?: string;
  ariaDisabled?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
}

export interface ProductToolbarMenuItemCopyProps {
  label: ReactNode;
  hint?: ReactNode;
  showHintInCompact?: boolean;
}

export interface ProductToolbarMenuBadgeProps {
  children: ReactNode;
  className?: string;
}

export interface ProductToolbarMenuGroupLabelProps {
  children: ReactNode;
}

export interface ProductToolbarMenuGroupCopyProps {
  hint: ReactNode;
  label: ReactNode;
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
  const menuRef = useFloatingSurfaceWheelContainment<HTMLDivElement>();
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
    <div ref={menuRef} className={resolvedClassName} style={style}>
      {title ? <div className="sniptale-toolbar-menu-title">{title}</div> : null}
      <div className="sniptale-toolbar-menu-list">{children}</div>
    </div>
  );
}

export function ProductToolbarMenuItem({
  children,
  className = '',
  dataUi,
  ariaDescribedBy,
  ariaDisabled = false,
  disabled = false,
  selected = false,
  onFocus,
  onMouseDown,
  onMouseEnter,
  onClick,
  type = 'button',
}: ProductToolbarMenuItemProps) {
  const resolvedClassName = [
    'sniptale-popover-item',
    'sniptale-toolbar-menu-item',
    selected ? 'sniptale-popover-item-selected' : '',
    disabled || ariaDisabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      data-ui={dataUi}
      aria-describedby={ariaDescribedBy}
      aria-disabled={ariaDisabled || undefined}
      disabled={disabled}
      className={resolvedClassName}
      onFocus={onFocus}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ProductToolbarMenuGroupLabel({ children }: ProductToolbarMenuGroupLabelProps) {
  return <div className="sniptale-toolbar-menu-title">{children}</div>;
}

export function ProductToolbarMenuGroupCopy({ hint, label }: ProductToolbarMenuGroupCopyProps) {
  return (
    <span className="sniptale-toolbar-menu-group-copy">
      <span>{label}</span>
      <span className="sniptale-toolbar-menu-group-hint">{hint}</span>
    </span>
  );
}

export function ProductToolbarMenuItemMeta({ children }: { children: ReactNode }) {
  return <span className="sniptale-toolbar-menu-item-meta">{children}</span>;
}

export function ProductToolbarMenuDetail({ children, id }: { children: ReactNode; id: string }) {
  return (
    <div id={id} className="sniptale-toolbar-menu-detail" role="status">
      {children}
    </div>
  );
}

export function ProductToolbarMenuItemCopy({
  label,
  hint,
  showHintInCompact = false,
}: ProductToolbarMenuItemCopyProps) {
  return (
    <span className="sniptale-toolbar-menu-item-copy">
      <span className="sniptale-toolbar-menu-item-label">{label}</span>
      {hint ? (
        <span
          className={[
            'sniptale-toolbar-menu-item-hint',
            showHintInCompact ? 'sniptale-toolbar-menu-item-hint--show-compact' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {hint}
        </span>
      ) : null}
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
