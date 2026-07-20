import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export interface ContentToolbarShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  dragging?: boolean;
  dataUi?: string;
}

export const ContentToolbarShell = forwardRef<HTMLDivElement, ContentToolbarShellProps>(
  function ContentToolbarShell({ children, className, dragging = false, dataUi, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.content-toolbar'}
        className={cx(
          'sniptale-glass-toolbar',
          'sniptale-toolbar-root sniptale-toolbar',
          dragging && 'sniptale-toolbar-dragging',
          className
        )}
      >
        {children}
      </div>
    );
  }
);

export interface ContentToolbarDragHandleProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  dataUi?: string;
}

export const ContentToolbarDragHandle = forwardRef<HTMLDivElement, ContentToolbarDragHandleProps>(
  function ContentToolbarDragHandle({ children, className, dataUi, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.content-toolbar-drag-handle'}
        className={cx('sniptale-drag-handle', className)}
      >
        {children}
      </div>
    );
  }
);

export interface ContentToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  utilities?: boolean;
  dataUi?: string;
}

export const ContentToolbarGroup = forwardRef<HTMLDivElement, ContentToolbarGroupProps>(
  function ContentToolbarGroup({ children, className, utilities = false, dataUi, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.content-toolbar-group'}
        className={cx('sniptale-group', utilities && 'sniptale-group-utilities', className)}
      >
        {children}
      </div>
    );
  }
);

export interface ContentToolbarDividerProps extends HTMLAttributes<HTMLDivElement> {
  dataUi?: string;
}

export const ContentToolbarDivider = forwardRef<HTMLDivElement, ContentToolbarDividerProps>(
  function ContentToolbarDivider({ className, dataUi, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.content-toolbar-divider'}
        className={cx('sniptale-glass-toolbar-divider', 'sniptale-divider', className)}
      />
    );
  }
);

export interface ContentToolbarSpacerProps extends HTMLAttributes<HTMLDivElement> {
  dataUi?: string;
}

export const ContentToolbarSpacer = forwardRef<HTMLDivElement, ContentToolbarSpacerProps>(
  function ContentToolbarSpacer({ className, dataUi, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.content-toolbar-spacer'}
        className={cx('sniptale-spacer', className)}
      />
    );
  }
);

export interface ContentToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
  menuIndicator?: boolean;
  tone?: 'default' | 'danger' | 'close';
  dataUi?: string;
}

export const ContentToolbarButton = forwardRef<HTMLButtonElement, ContentToolbarButtonProps>(
  function ContentToolbarButton(
    {
      children,
      className,
      active = false,
      menuIndicator = false,
      tone = 'default',
      dataUi,
      title,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) {
    const dataActive = active ? 'true' : undefined;
    const resolvedAriaLabel = ariaLabel ?? (typeof title === 'string' ? title : undefined);

    return (
      <button
        {...props}
        ref={ref}
        title={typeof title === 'string' ? title : undefined}
        aria-label={resolvedAriaLabel}
        data-ui={dataUi ?? 'shared.ui.content-toolbar-button'}
        data-active={dataActive}
        data-menu-indicator={menuIndicator ? 'true' : undefined}
        className={cx(
          'sniptale-glass-toolbar-button',
          'sniptale-btn',
          active && 'sniptale-glass-toolbar-button--active',
          tone === 'danger' && 'sniptale-glass-toolbar-button--danger',
          tone === 'danger' && 'sniptale-btn-danger',
          tone === 'close' && 'sniptale-btn-close',
          tone === 'default' && 'sniptale-toggle',
          className
        )}
      >
        {children}
      </button>
    );
  }
);
