import type { CSSProperties, MouseEventHandler, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';

export interface ContentPopoverAdapterProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  portalTarget?: HTMLElement | ShadowRoot | DocumentFragment | null;
  popoverRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  detachedChildren?: ReactNode;
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

function resolvePositionerStyle(style?: CSSProperties): CSSProperties {
  const { width: _width, ...positionerStyle } = style ?? {};
  return {
    display: 'inline-block',
    width: 'max-content',
    ...positionerStyle,
  };
}

function resolveZoomSurfaceStyle(theme: 'light' | 'dark' | null, width?: CSSProperties['width']) {
  const style = width === undefined ? undefined : ({ width } satisfies CSSProperties);
  return resolvePopoverStyle(theme, style);
}

export function ContentPopoverAdapter({
  isOpen,
  anchorEl,
  portalTarget,
  popoverRef,
  className,
  style,
  children,
  detachedChildren,
  dataUi,
}: ContentPopoverAdapterProps) {
  const surfaceRef = useFloatingSurfaceWheelContainment(popoverRef);
  const portalTheme = useResolvedPortalTheme(anchorEl);

  if (!isOpen) {
    return null;
  }

  const resolvedPortalTarget = portalTarget ?? resolveThemeSafePortalTarget(anchorEl);
  return (
    <>
      {createPortal(
        <div className="sniptale-content-popover-positioner" style={resolvePositionerStyle(style)}>
          <div
            ref={surfaceRef}
            className={joinClassNames(
              'sniptale-content-popover sniptale-content-ui-zoom-surface',
              className
            )}
            data-ui={dataUi ?? 'shared.ui.content-popover'}
            data-theme={portalTheme ?? undefined}
            style={resolveZoomSurfaceStyle(portalTheme, style?.width)}
            onMouseDown={stopPopoverEventPropagation}
            onClick={stopPopoverEventPropagation}
          >
            <div className="sniptale-content-popover-body">{children}</div>
          </div>
        </div>,
        resolvedPortalTarget
      )}
      {detachedChildren ? createPortal(detachedChildren, resolvedPortalTarget) : null}
    </>
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
