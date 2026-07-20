import type { CSSProperties, MouseEventHandler, ReactNode, Ref } from 'react';
import type { AppTheme } from '../../../ui/theme/index';

export type GlassPopoverProps = {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  popoverRef?: Ref<HTMLDivElement>;
  dataUi?: string;
  theme?: AppTheme | null;
};

function stopPopoverEventPropagation(
  event: Parameters<MouseEventHandler<HTMLDivElement>>[0]
): void {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function GlassPopover({
  children,
  className,
  bodyClassName,
  style,
  popoverRef,
  dataUi,
  theme,
}: GlassPopoverProps) {
  const rootClassName = className
    ? `sniptale-glass-popover ${className}`
    : 'sniptale-glass-popover';
  const resolvedBodyClassName = bodyClassName
    ? `sniptale-glass-popover-body ${bodyClassName}`
    : 'sniptale-glass-popover-body';

  return (
    <div
      ref={popoverRef}
      className={rootClassName}
      data-ui={dataUi ?? 'shared.ui.glass-popover'}
      data-theme={theme ?? undefined}
      style={theme ? { ...style, colorScheme: theme } : style}
      onMouseDown={stopPopoverEventPropagation}
      onClick={stopPopoverEventPropagation}
    >
      <div className={resolvedBodyClassName}>{children}</div>
    </div>
  );
}

export type GlassSectionProps = {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
  dataUi?: string;
};

export function GlassSection({ children, title, className, dataUi }: GlassSectionProps) {
  const sectionClassName = className
    ? `sniptale-glass-section ${className}`
    : 'sniptale-glass-section';

  return (
    <section className={sectionClassName} data-ui={dataUi ?? 'shared.ui.glass-section'}>
      {title ? <label className="sniptale-glass-section-label">{title}</label> : null}
      {children}
    </section>
  );
}
