import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { isComposedEventWithinElement } from '@sniptale/ui/dom-events';
import { translate } from '../../platform/i18n';

/** Authored commands stay mounted while the header owns menu dismissal and focus. */
export function ReviewInspectorActionMenu({
  onHost,
  scope,
  disabled = false,
}: {
  onHost(host: HTMLDivElement | null): void;
  scope: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const last = useRef(false);
  const buttons = () => [
    ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];
  const close = (restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => setOpen(false), [scope]);
  useEffect(() => {
    if (!open) return;
    const items = buttons();
    (last.current ? items.at(-1) : items[0])?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!isComposedEventWithinElement(event, root.current)) close(false);
    };
    const panel = menu.current;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
        }
        close();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const items = buttons();
        const current = items.findIndex((button) => button === document.activeElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const activate = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) close();
    };
    // Authored commands are React portals; native listeners follow their actual menu placement.
    document.addEventListener('keydown', key, true);
    panel?.addEventListener('click', activate);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
      panel?.removeEventListener('click', activate);
    };
  }, [open]);
  return (
    <div ref={root} className="review-inspector-action-menu-root relative shrink-0">
      <ContentToolbarButton
        ref={trigger}
        tone="utility"
        size="compact"
        title={translate('gallery.videoReview.actionActions')}
        aria-label={translate('gallery.videoReview.actionActions')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        dataUi="gallery.videoReview.inspectorActionMenuTrigger"
        onClick={() => {
          last.current = false;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          last.current = event.key === 'ArrowUp';
          setOpen(true);
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <div ref={menu} hidden={!open} style={{ display: open ? undefined : 'none' }}>
        <ProductDropdownMenu
          id={id}
          role="menu"
          aria-label={translate('gallery.videoReview.actionActions')}
          className="review-inspector-action-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            left: 'auto',
            width: 224,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'min(60vh, 320px)',
            overflowY: 'auto',
            zIndex: 60,
          }}
        >
          <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
            <div ref={onHost} data-ui="gallery.videoReview.inspectorActionMenu" />
          </fieldset>
        </ProductDropdownMenu>
      </div>
    </div>
  );
}
