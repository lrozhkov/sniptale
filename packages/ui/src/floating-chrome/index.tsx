import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

export function floatingChromeClassNames(
  ...classNames: Array<string | false | null | undefined>
): string {
  return classNames.filter(Boolean).join(' ');
}

export const FLOATING_CHROME_ROOT_CLASS_NAME = 'pointer-events-none absolute inset-0 z-30';

export const FLOATING_CHROME_PANEL_CLASS_NAME = [
  'pointer-events-auto rounded-[14px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
  'border-t-[color:color-mix(in_srgb,var(--sniptale-color-text-inverse)_22%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
  [
    'shadow-[0_8px_20px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent),',
    'inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-inverse)_6%,transparent)]',
  ].join(''),
  'backdrop-blur-[12px]',
].join(' ');

export const FLOATING_CHROME_TOOLBAR_CLASS_NAME = floatingChromeClassNames(
  'sniptale-toolbar-root',
  FLOATING_CHROME_PANEL_CLASS_NAME,
  'flex items-center',
  'gap-1.5 p-1.5'
);

interface FloatingChromeSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  dataUi?: string;
}

export function FloatingChromeRoot({
  children,
  className,
  dataUi,
  ...props
}: FloatingChromeSurfaceProps) {
  return (
    <div
      data-ui={dataUi ?? 'shared.ui.floating-chrome.root'}
      className={floatingChromeClassNames(FLOATING_CHROME_ROOT_CLASS_NAME, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const FloatingChromeToolbar = forwardRef<HTMLDivElement, FloatingChromeSurfaceProps>(
  function FloatingChromeToolbar({ children, className, dataUi, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.floating-chrome.toolbar'}
        className={floatingChromeClassNames(FLOATING_CHROME_TOOLBAR_CLASS_NAME, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

export const FloatingChromePanel = forwardRef<HTMLDivElement, FloatingChromeSurfaceProps>(
  function FloatingChromePanel({ children, className, dataUi, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-ui={dataUi ?? 'shared.ui.floating-chrome.panel'}
        className={floatingChromeClassNames(FLOATING_CHROME_PANEL_CLASS_NAME, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

export function FloatingChromeDivider({
  className,
  vertical = true,
}: {
  className?: string;
  vertical?: boolean;
}) {
  return (
    <div
      className={floatingChromeClassNames(
        vertical ? 'h-8 w-px' : 'h-px w-full',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-inverse)_10%,transparent)]',
        className
      )}
    />
  );
}
