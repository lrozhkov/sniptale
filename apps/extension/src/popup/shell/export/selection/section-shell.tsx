import type { ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

import { translate } from '../../../../platform/i18n/popup';
import {
  INLINE_CURTAIN_PANEL_CLASS_NAME,
  InlineCurtainPanelHeader,
} from '../../../../ui/popup-shell/inline-curtain/trigger';
import { cx } from './utils';

type ExportSelectionSectionShellProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  drawerLabel: string;
  drawerDescription: string;
  isExpanded?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  title: string;
};

const shellClassName = 'flex min-h-0 flex-col overflow-hidden';

const triggerClassName = [
  'group -mx-1 flex w-[calc(100%+8px)] items-center rounded-[9px] px-2 py-1.5 text-left',
  'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
].join(' ');

function useInlineDrawerDismiss(
  isOpen: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLDivElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>
) {
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex="0"]'
        ) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    queueMicrotask(() => rootRef.current?.querySelector<HTMLElement>('button')?.focus());
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, rootRef, triggerRef]);
}

export function ExportSelectionSectionShell({
  bodyClassName,
  children,
  className,
  drawerLabel,
  drawerDescription,
  isExpanded = false,
  isOpen,
  onClose,
  onOpen,
  title,
}: ExportSelectionSectionShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerId = useId();

  useInlineDrawerDismiss(isOpen, onClose, rootRef, triggerRef);

  if (isOpen) {
    return (
      <>
        <button
          type="button"
          aria-label={translate('common.actions.close')}
          className={[
            'absolute inset-0 z-10 cursor-default',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,transparent)]',
            'backdrop-blur-[4px]',
          ].join(' ')}
          data-ui="popup.export.selection-curtain-backdrop"
          onClick={onClose}
        />
        <section
          ref={rootRef}
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-label={drawerLabel}
          className={cx(
            INLINE_CURTAIN_PANEL_CLASS_NAME,
            '!w-[90%] !max-w-[calc(100%-36px)] flex min-h-0 flex-col',
            className
          )}
          data-ui="popup.export.selection-curtain"
        >
          <InlineCurtainPanelHeader
            action="back"
            actionAriaLabel={translate('popup.export.backButton')}
            description={drawerDescription}
            onAction={onClose}
            title={title}
          />
          <div className={cx('min-h-0 flex-1 overflow-hidden', bodyClassName)}>{children}</div>
        </section>
      </>
    );
  }

  return (
    <section ref={rootRef} className={cx(shellClassName, isExpanded && 'flex-1', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={drawerId}
        aria-expanded={isOpen}
        className={triggerClassName}
        data-ui="popup.export.selection-trigger"
        onClick={onOpen}
      >
        <span
          className={[
            'min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
            'text-[var(--sniptale-color-text-muted-strong)]',
          ].join(' ')}
          data-ui="popup.export.selection-heading"
        >
          {title}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={[
            'h-3.5 w-3.5 shrink-0 translate-x-0.5 opacity-0',
            'transition-[opacity,transform] duration-150',
            'group-hover:translate-x-0 group-hover:opacity-100',
            'group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
          ].join(' ')}
        />
      </button>
      <div
        id={drawerId}
        aria-label={drawerLabel}
        className={cx('min-h-0 overflow-hidden', bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}
