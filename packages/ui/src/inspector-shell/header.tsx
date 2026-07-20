import type { ReactNode } from 'react';
import {
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
  INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
} from './tokens';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export interface InspectorShellHeaderSegmentProps {
  children: ReactNode;
  collapsed?: boolean;
  expandedWidthClassName?: string;
  collapsedWidthClassName?: string;
  className?: string;
  dataUi?: string;
}

export function InspectorShellHeaderSegment({
  children,
  collapsed = false,
  expandedWidthClassName = INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
  collapsedWidthClassName = INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  className,
  dataUi,
}: InspectorShellHeaderSegmentProps) {
  return (
    <div
      data-ui={dataUi ?? 'shared.ui.inspector-shell-header-segment'}
      className={cx(
        'flex min-w-0 shrink-0 items-center overflow-hidden border-r',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        'transition-[width,padding,border-color] duration-200',
        INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
        collapsed ? collapsedWidthClassName : expandedWidthClassName,
        className
      )}
    >
      {children}
    </div>
  );
}
