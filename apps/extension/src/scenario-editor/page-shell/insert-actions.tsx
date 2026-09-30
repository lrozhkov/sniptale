import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useGlassSelectDismiss } from '@sniptale/ui/glass-select/dismiss';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { useGuideMenuHover } from './menu-hover';
import { useGuideInsertLayout } from './insert-layout';

type InsertAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  pressed?: boolean;
};

function useInsertDisclosure(disabled: boolean, width: number) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focus = useRef<'row' | 'trigger' | null>(null);
  const hover = useGuideMenuHover(true, disabled, row, setOpen);
  useGlassSelectDismiss({ isOpen: open, setIsOpen: setOpen, containerRef: anchor, menuRef: row });
  const style = useGuideInsertLayout({
    open,
    anchorRef: anchor,
    menuRef: row,
    width,
    close: setOpen,
  });
  useEffect(() => {
    if (open && focus.current === 'row')
      row.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    if (!open && focus.current === 'trigger') trigger.current?.focus();
    focus.current = null;
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function enterRow() {
    if (disabled) return;
    if (open) row.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    else {
      focus.current = 'row';
      setOpen(true);
    }
  }
  function close(restore: boolean) {
    hover.cancel();
    focus.current = restore ? 'trigger' : null;
    setOpen(false);
  }
  return { open, anchor, row, trigger, hover, style, enterRow, close, setOpen };
}

/** Owns the plus-to-icon-row interaction at one stable document insertion boundary. */
export function GuideInsertActions({
  label,
  items,
  disabled,
}: {
  label: string;
  items: InsertAction[];
  disabled: boolean;
}) {
  const ui = useInsertDisclosure(disabled, Math.max(136, 8 + items.length * 40));
  const id = useId();
  const theme = useResolvedPortalTheme(ui.anchor.current);
  return (
    <div
      ref={ui.anchor}
      className="guide-action-menu-anchor"
      data-insert-open={ui.open || undefined}
      onMouseLeave={ui.hover.leave}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof Node &&
          (ui.anchor.current?.contains(next) || ui.row.current?.contains(next))
        )
          return;
        ui.close(false);
      }}
    >
      <ContentToolbarButton
        ref={ui.trigger}
        type="button"
        title={label}
        disabled={disabled}
        aria-expanded={ui.open}
        aria-controls={id}
        aria-hidden={ui.open || undefined}
        tabIndex={ui.open ? -1 : undefined}
        onMouseEnter={ui.hover.enter}
        onClick={ui.enterRow}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          ui.enterRow();
        }}
      >
        <Plus size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {ui.open &&
        createPortal(
          <div
            ref={ui.row}
            id={id}
            data-theme={theme ?? undefined}
            className="sniptale-ai-modal-root guide-action-menu guide-action-menu--insert"
            style={ui.style}
            onMouseEnter={ui.hover.cancel}
            onMouseLeave={ui.hover.leave}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                ui.close(true);
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
              event.preventDefault();
              const buttons = [
                ...(ui.row.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ??
                  []),
              ];
              const current = buttons.findIndex((button) => button === event.target);
              const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
              buttons[(current + delta + buttons.length) % buttons.length]?.focus();
            }}
          >
            <div role="group" aria-label={label} className="guide-insert-actions">
              {items.map((item) => (
                <ContentToolbarButton
                  key={item.label}
                  type="button"
                  title={item.label}
                  aria-pressed={item.pressed}
                  disabled={item.disabled ?? false}
                  onClick={(event) => {
                    ui.close(event.detail === 0);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  <span role="tooltip" className="guide-insert-tooltip">
                    {item.label}
                  </span>
                </ContentToolbarButton>
              ))}
            </div>
          </div>,
          resolveThemeSafePortalTarget(ui.anchor.current)
        )}
    </div>
  );
}
