import type { CSSProperties, ReactNode } from 'react';
import {
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from './tokens';
import {
  INSPECTOR_ACTION_BACKGROUND_CLASS_NAME,
  INSPECTOR_PANEL_BACKGROUND_CLASS_NAME,
} from './styles.constants';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export interface InspectorShellFrameProps {
  children: ReactNode;
  collapsed?: boolean;
  expandedWidthClassName?: string;
  collapsedWidthClassName?: string;
  className?: string;
  dataUi?: string;
}

export function InspectorShellFrame({
  children,
  collapsed = false,
  expandedWidthClassName = INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
  collapsedWidthClassName = INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  className,
  dataUi,
}: InspectorShellFrameProps) {
  return (
    <aside
      data-ui={dataUi ?? 'shared.ui.inspector-shell-frame'}
      className={cx(
        'flex min-h-0 shrink-0 border-r',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_92%,transparent)]',
        'transition-[width,border-color,background-color] duration-200',
        collapsed ? collapsedWidthClassName : expandedWidthClassName,
        className
      )}
    >
      {children}
    </aside>
  );
}

export interface InspectorShellPanelProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  dataUi?: string;
}

export function InspectorShellPanel({
  children,
  style,
  className,
  dataUi,
}: InspectorShellPanelProps) {
  return (
    <div
      data-ui={dataUi ?? 'shared.ui.inspector-shell-panel'}
      style={style}
      className={cx(
        'flex min-h-0 w-full flex-col',
        [
          INSPECTOR_PANEL_BACKGROUND_CLASS_NAME,
          'shadow-[inset_-1px_0_0_color-mix(in_srgb,var(--sniptale-color-border-subtle)_28%,transparent)]',
        ].join(' '),
        className
      )}
    >
      {children}
    </div>
  );
}

export interface InspectorShellHeaderActionProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
  variant?: 'compact' | 'surface';
  className?: string;
  dataUi?: string;
}

export function InspectorShellHeaderAction({
  title,
  onClick,
  children,
  variant = 'compact',
  className,
  dataUi,
}: InspectorShellHeaderActionProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      data-ui={dataUi ?? 'shared.ui.inspector-shell-header-action'}
      className={cx(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition',
        variant === 'compact'
          ? [
              'bg-transparent text-[var(--sniptale-color-text-muted-strong)]',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')
          : [
              'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
              INSPECTOR_ACTION_BACKGROUND_CLASS_NAME,
              'text-[var(--sniptale-color-text-secondary)]',
              'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_74%,transparent)]',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' '),
        className
      )}
    >
      {children}
    </button>
  );
}
