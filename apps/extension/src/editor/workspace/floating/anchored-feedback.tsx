import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useFloatingPositionRefresh } from './position-refresh';

function useAnchoredPopoverPosition(anchorEl: HTMLElement | null, width: number): CSSProperties {
  useFloatingPositionRefresh(anchorEl);
  if (!anchorEl) {
    return { left: 0, pointerEvents: 'none', position: 'fixed', top: 0, visibility: 'hidden' };
  }
  const margin = 12;
  const gap = 8;
  const resolvedWidth = Math.min(width, window.innerWidth - margin * 2);
  const anchor = anchorEl.getBoundingClientRect();
  const left = Math.max(
    margin,
    Math.min(
      anchor.left + anchor.width / 2 - resolvedWidth / 2,
      window.innerWidth - resolvedWidth - margin
    )
  );
  return {
    left,
    position: 'fixed',
    top: anchor.bottom + gap,
    width: resolvedWidth,
    zIndex: 2147483647,
  };
}

export function useAnchoredDialogLifecycle(args: {
  anchorEl: HTMLElement | null;
  initialFocusSelector: string;
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { anchorEl, initialFocusSelector, popoverRef } = args;
  const onCloseRef = useRef(args.onClose);
  onCloseRef.current = args.onClose;
  useEffect(() => {
    const ownerDocument = anchorEl?.ownerDocument ?? document;
    popoverRef.current?.querySelector<HTMLElement>(initialFocusSelector)?.focus();
    const close = () => onCloseRef.current();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorEl?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab' || !popoverRef.current) return;
      const focusableSelector = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      const focusable = [
        ...popoverRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && ownerDocument.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    ownerDocument.addEventListener('pointerdown', dismissOutside);
    ownerDocument.addEventListener('keydown', dismissOnEscape);
    return () => {
      ownerDocument.removeEventListener('pointerdown', dismissOutside);
      ownerDocument.removeEventListener('keydown', dismissOnEscape);
      if (anchorEl?.isConnected) anchorEl.focus();
    };
  }, [anchorEl, initialFocusSelector, popoverRef]);
}

export function EditorAnchoredConfirmPopover(props: {
  anchorEl: HTMLElement | null;
  cancelText: ReactNode;
  confirmText: ReactNode;
  dataUi: string;
  message: ReactNode;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  title: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const style = useAnchoredPopoverPosition(props.anchorEl, 320);
  useAnchoredDialogLifecycle({
    anchorEl: props.anchorEl,
    initialFocusSelector: '[data-confirm-action="true"]',
    onClose: props.onCancel,
    popoverRef,
  });

  const confirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await props.onConfirm();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <ContentPopoverAdapter
      anchorEl={props.anchorEl}
      className="sniptale-content-popover--compact !w-[320px]"
      dataUi={props.dataUi}
      isOpen
      popoverRef={popoverRef}
      style={style}
    >
      <div role="alertdialog" aria-labelledby={`${props.dataUi}.title`} className="space-y-3 p-1">
        <div>
          <div
            id={`${props.dataUi}.title`}
            className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
          >
            {props.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
            {props.message}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <ProductActionButton compact tone="secondary" disabled={pending} onClick={props.onCancel}>
            {props.cancelText}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="danger"
            disabled={pending}
            onClick={() => void confirm()}
            data-confirm-action="true"
          >
            {props.confirmText}
          </ProductActionButton>
        </div>
      </div>
    </ContentPopoverAdapter>
  );
}

export function EditorAnchoredAlert(props: {
  anchorEl: HTMLElement | null;
  children: ReactNode;
  dataUi: string;
}) {
  return (
    <ContentPopoverAdapter
      anchorEl={props.anchorEl}
      className="sniptale-content-popover--compact !w-[min(300px,calc(100vw-24px))]"
      dataUi={props.dataUi}
      isOpen
      style={useAnchoredPopoverPosition(props.anchorEl, 300)}
    >
      <div role="alert" className="p-1 text-xs leading-relaxed text-[var(--sniptale-color-danger)]">
        {props.children}
      </div>
    </ContentPopoverAdapter>
  );
}
