import type { CSSProperties, MouseEventHandler, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';

export interface ContentPopoverAdapterProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  portalTarget?: HTMLElement | ShadowRoot | DocumentFragment | null;
  popoverRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  dataUi?: string;
}

interface ContentPopoverSectionProps {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
  dataUi?: string;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function stopPopoverEventPropagation(
  event: Parameters<MouseEventHandler<HTMLDivElement>>[0]
): void {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

function resolvePopoverStyle(theme: 'light' | 'dark' | null, style?: CSSProperties) {
  if (!theme || !style) {
    return theme ? { colorScheme: theme } : style;
  }

  return { ...style, colorScheme: theme };
}

export function ContentPopoverAdapter({
  isOpen,
  anchorEl,
  portalTarget,
  popoverRef,
  className,
  style,
  children,
  dataUi,
}: ContentPopoverAdapterProps) {
  const portalTheme = useResolvedPortalTheme(anchorEl);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={joinClassNames('sniptale-content-popover', className)}
      data-ui={dataUi ?? 'shared.ui.content-popover'}
      data-theme={portalTheme ?? undefined}
      style={resolvePopoverStyle(portalTheme, style)}
      onMouseDown={stopPopoverEventPropagation}
      onClick={stopPopoverEventPropagation}
    >
      <div className="sniptale-content-popover-body">{children}</div>
    </div>,
    portalTarget ?? resolveThemeSafePortalTarget(anchorEl)
  );
}

export function ContentPopoverSection({
  children,
  title,
  className,
  dataUi,
}: ContentPopoverSectionProps) {
  return (
    <section
      className={joinClassNames('sniptale-content-popover-section', className)}
      data-ui={dataUi ?? 'shared.ui.content-popover-section'}
    >
      {title ? <label className="sniptale-content-popover-section-label">{title}</label> : null}
      {children}
    </section>
  );
}
