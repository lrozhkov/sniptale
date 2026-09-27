import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownItem, ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { useGuideMenuHover } from './menu-hover';

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
  tone = 'default',
  openOnHover = false,
}: {
  label: string;
  icon: ReactNode;
  items: GuideMenuItem[];
  disabled?: boolean;
  tone?: 'default' | 'utility';
  openOnHover?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusMenu = useRef(false);
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
  const hover = useGuideMenuHover(openOnHover, disabled, menuRef, setOpen);
  const close = () => {
    hover.cancel();
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (open && focusMenu.current)
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    focusMenu.current = false;
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div
      ref={containerRef}
      className="guide-action-menu-anchor"
      onMouseLeave={hover.leave}
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
        tone={tone}
        type="button"
        title={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onMouseEnter={hover.enter}
        onClick={() => {
          focusMenu.current = true;
          if (open && openOnHover) {
            menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
            return;
          }
          setOpen((value) => (openOnHover ? true : !value));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          focusMenu.current = true;
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
            onMouseEnter={hover.cancel}
            onMouseLeave={hover.leave}
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
