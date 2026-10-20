import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
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
  onOpenSettings?: () => void;
  settingsAriaLabel?: string;
  title: string;
};

const shellClassName = 'flex min-h-0 flex-col overflow-hidden';

const triggerClassName = [
  'group flex min-w-0 flex-1 items-center gap-1 rounded-[6px] px-2 py-1.5 text-left outline-none',
  'transition-colors hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
].join(' ');

function isFloatingInteractionEvent(event: PointerEvent): boolean {
  return event.composedPath().some((target) => {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    return Boolean(element?.closest('[data-floating-ui-root="true"]'));
  });
}

function useInlineDrawerDismiss(
  isOpen: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLDivElement | null>,
  restoreFocus: () => void
) {
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) restoreFocus();
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !isFloatingInteractionEvent(event)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (rootRef.current?.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]'))
          return;
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
    if (justOpened) {
      queueMicrotask(() => rootRef.current?.querySelector<HTMLElement>('button')?.focus());
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, rootRef, restoreFocus]);
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
  onOpenSettings,
  settingsAriaLabel,
  title,
}: ExportSelectionSectionShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<'selection' | 'settings'>('selection');
  const drawerId = useId();
  const restoreFocus = useCallback(() => {
    const target = openerRef.current === 'settings' ? settingsTriggerRef.current : null;
    (target ?? triggerRef.current)?.focus();
  }, []);

  useInlineDrawerDismiss(isOpen, onClose, rootRef, restoreFocus);

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
      <div className="flex w-full items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          aria-controls={drawerId}
          aria-expanded={isOpen}
          className={triggerClassName}
          data-ui="popup.export.selection-trigger"
          onClick={() => {
            openerRef.current = 'selection';
            onOpen();
          }}
        >
          <span
            className={[
              'min-w-0 flex-1 text-[12px] font-medium',
              'text-[var(--sniptale-color-text-muted-strong)]',
            ].join(' ')}
            data-ui="popup.export.selection-heading"
          >
            {title}
          </span>
          <ChevronRight
            aria-hidden="true"
            className={[
              'h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150',
              'group-hover:opacity-100 group-focus-visible:opacity-100',
            ].join(' ')}
          />
        </button>
        {onOpenSettings ? (
          <button
            type="button"
            aria-label={settingsAriaLabel ?? translate('popup.export.pageSettingsTitle')}
            className={[
              'shrink-0 rounded-[6px] px-2 py-1 text-[11px] font-medium',
              'text-[var(--sniptale-color-text-secondary)] transition-colors',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_70%,transparent)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')}
            data-ui="popup.export.selection-settings"
            ref={settingsTriggerRef}
            onClick={() => {
              openerRef.current = 'settings';
              onOpenSettings();
            }}
          >
            {translate('popup.export.settingsAction')}
          </button>
        ) : null}
      </div>
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
