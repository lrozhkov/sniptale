import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';

/** Own the private parameter portal placement, focus, dismissal, and responsive lifetime. */
export function RasterParametersPopover(props: {
  children: ReactNode;
  title: string;
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const theme = useResolvedPortalTheme(trigger.current);
  const [position, setPosition] = useState({ left: 12, top: 90 });
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const updatePlacement = () => {
      if (window.innerWidth >= 1500) {
        if (panel.current?.contains(document.activeElement)) {
          trigger.current
            ?.closest('[data-ui="editor.raster.toolbar"]')
            ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
            ?.focus();
        }
        setOpen(false);
        return;
      }
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
        top: rect.bottom + 6,
      });
    };
    updatePlacement();
    const firstControl = panel.current?.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
    );
    (firstControl ?? panel.current)?.focus();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target) &&
        !(event.target instanceof Element && event.target.closest('[data-floating-ui-root="true"]'))
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <>
      <ContentToolbarButton
        ref={trigger}
        dataUi="editor.raster.parameters"
        tone="outline"
        title={props.title}
        aria-label={props.title}
        aria-expanded={open}
        aria-haspopup="dialog"
        menuIndicator
        onClick={() => setOpen(!open)}
        className={props.triggerClassName}
      >
        {props.trigger}
      </ContentToolbarButton>
      {open
        ? createPortal(
            <FloatingChromePanel
              ref={panel}
              data-theme={theme ?? undefined}
              role="dialog"
              tabIndex={-1}
              aria-label={props.title}
              data-floating-ui-root="true"
              className="fixed z-50 w-80 overflow-auto p-3 [&>div]:flex-wrap"
              style={{ ...position, maxHeight: `calc(100vh - ${position.top + 12}px)` }}
            >
              {props.children}
            </FloatingChromePanel>,
            resolveThemeSafePortalTarget(trigger.current)
          )
        : null}
    </>
  );
}
