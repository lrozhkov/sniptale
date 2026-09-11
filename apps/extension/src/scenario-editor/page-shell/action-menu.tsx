import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownItem, ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';

type GuideMenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** Owns a compact command disclosure with shared placement, dismissal and theme surfaces. */
export function GuideActionMenu({
  label,
  icon,
  items,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  items: GuideMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const theme = useResolvedPortalTheme(containerRef.current);
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: setOpen,
    containerRef,
    menuRef,
    menuWidth: 232,
  });
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div
      ref={containerRef}
      className="guide-action-menu-anchor"
      onBlurCapture={(event) => {
        if (!open) return;
        const next = event.relatedTarget;
        if (
          next instanceof Node &&
          (containerRef.current?.contains(next) || menuRef.current?.contains(next))
        )
          return;
        setOpen(false);
      }}
    >
      <ContentToolbarButton
        ref={trigger}
        type="button"
        title={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {icon}
      </ContentToolbarButton>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            data-theme={theme ?? undefined}
            className="sniptale-ai-modal-root guide-action-menu"
            style={portalStyle}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
              }
              const buttons = [
                ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ??
                  []),
              ];
              const current = buttons.findIndex((button) => button === document.activeElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                buttons[
                  (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                ]?.focus();
              }
            }}
          >
            <ProductDropdownMenu role="group" aria-label={label}>
              {items.map((item) => (
                <ProductDropdownItem
                  key={item.label}
                  danger={item.danger ?? false}
                  disabled={item.disabled ?? false}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </ProductDropdownItem>
              ))}
            </ProductDropdownMenu>
          </div>,
          resolveThemeSafePortalTarget(containerRef.current)
        )}
    </div>
  );
}
