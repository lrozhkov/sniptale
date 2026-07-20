import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from 'react';

export interface ProductDropdownMenuProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface ProductDropdownItemProps {
  children: ReactNode;
  className?: string;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
}

export interface ProductDropdownSectionLabelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface ProductTemplateMenuShellProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  menuLabel?: string;
  menuDisabled?: boolean;
  open?: boolean;
  menuClassName?: string;
  menuStyle?: CSSProperties;
  onMenuClick?: MouseEventHandler<HTMLButtonElement>;
  onMenuMouseDown?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Canonical dropdown surface for product menus used in AI/template flows.
 */
export function ProductDropdownMenu({
  children,
  className = '',
  style,
  ...props
}: ProductDropdownMenuProps) {
  return (
    <div
      {...props}
      className={['sniptale-dropdown-menu', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

export function ProductDropdownItem({
  children,
  className = '',
  danger = false,
  selected = false,
  disabled = false,
  type = 'button',
  onClick,
  onMouseDown,
  title,
}: ProductDropdownItemProps) {
  const resolvedClassName = [
    'sniptale-dropdown-item',
    danger ? 'danger' : '',
    selected ? 'sniptale-popover-item-selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={resolvedClassName}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={title}
    >
      {children}
    </button>
  );
}

export function ProductDropdownDivider() {
  return <div className="sniptale-dropdown-divider" />;
}

export function ProductDropdownSectionLabel({
  children,
  className = '',
  style,
}: ProductDropdownSectionLabelProps) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function ProductTemplateMenuTrigger({
  menuDisabled,
  menuLabel,
  onMenuClick,
  onMenuMouseDown,
  open,
}: Pick<
  ProductTemplateMenuShellProps,
  'menuDisabled' | 'menuLabel' | 'onMenuClick' | 'onMenuMouseDown' | 'open'
>) {
  const triggerClassName = ['sniptale-template-menu-btn', open ? 'menu-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      data-menu-btn="true"
      className={triggerClassName}
      disabled={menuDisabled}
      title={typeof menuLabel === 'string' ? menuLabel : undefined}
      aria-label={typeof menuLabel === 'string' ? menuLabel : undefined}
      onClick={onMenuClick}
      onMouseDown={onMenuMouseDown}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="12" cy="19" r="1.5" />
      </svg>
    </button>
  );
}

export const ProductTemplateMenuShell = forwardRef<HTMLDivElement, ProductTemplateMenuShellProps>(
  function ProductTemplateMenuShell(
    {
      label,
      menuLabel,
      menuDisabled = false,
      open = false,
      children,
      className = '',
      menuClassName = '',
      menuStyle,
      onMenuClick,
      onMenuMouseDown,
      ...props
    },
    ref
  ) {
    const shellClassName = ['sniptale-template-pill', open ? 'menu-open' : '', className]
      .filter(Boolean)
      .join(' ');
    const labelNode =
      typeof label === 'string' ? <div className="sniptale-template-btn">{label}</div> : label;

    return (
      <div ref={ref} className={shellClassName} {...props}>
        {labelNode}
        <ProductTemplateMenuTrigger
          menuDisabled={menuDisabled}
          open={open}
          {...(menuLabel === undefined ? {} : { menuLabel })}
          {...(onMenuClick === undefined ? {} : { onMenuClick })}
          {...(onMenuMouseDown === undefined ? {} : { onMenuMouseDown })}
        />
        {open ? (
          <ProductDropdownMenu
            className={['sniptale-template-dropdown', menuClassName].filter(Boolean).join(' ')}
            {...(menuStyle === undefined ? {} : { style: menuStyle })}
          >
            {children}
          </ProductDropdownMenu>
        ) : null}
      </div>
    );
  }
);
