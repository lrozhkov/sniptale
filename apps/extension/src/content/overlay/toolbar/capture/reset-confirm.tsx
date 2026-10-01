import type { PagePreparationResetScope } from '../../../parser/page-preparation/history';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarMenuState } from '../state/menu';
import { getToolbarMenuPosition } from '../menu/position';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';

const RESET_MESSAGES = {
  all: 'content.toolbar.resetPagePreparationMessage',
  drawing: 'content.toolbar.resetDrawingMessage',
  annotation: 'content.toolbar.resetAnnotationMessage',
  'content-editing': 'content.toolbar.resetContentEditingMessage',
  'design-review': 'content.toolbar.resetDesignReviewMessage',
} as const;

export function ToolbarResetConfirmControl(props: {
  available: boolean;
  scope?: PagePreparationResetScope;
  displayMode: ContentToolbarDisplayMode;
  toolbarMenuState: ToolbarMenuState;
  onConfirm: (() => void) | undefined;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const keyboardOpening = useRef(false);
  const restoreFocus = useRef(false);
  const confirmed = useRef(false);
  const [menuHeight, setMenuHeight] = useState(160);
  const titleId = useId();
  const messageId = useId();
  const { closeMenu, toggleMenu, activeMenuType } = props.toolbarMenuState;
  const open = props.available && activeMenuType === 'reset-confirm';
  const close = useCallback(() => closeMenu('reset-confirm'), [closeMenu]);
  const escapeClose = useCallback(() => {
    restoreFocus.current = true;
    close();
  }, [close]);

  useToolbarFloatingMenuDismissal({
    open,
    triggerRef,
    menuRef,
    onClose: close,
    onEscapeClose: escapeClose,
  });
  useEffect(() => {
    if (!props.available) close();
  }, [close, props.available]);
  useEffect(() => close, [close]);
  useLayoutEffect(() => {
    if (!open) {
      if (restoreFocus.current && props.available) triggerRef.current?.focus();
      restoreFocus.current = false;
      return;
    }
    confirmed.current = false;
    if (keyboardOpening.current)
      menuRef.current?.querySelector<HTMLButtonElement>('[role="alertdialog"] button')?.focus();
    const surface = menuRef.current?.querySelector<HTMLElement>('.sniptale-popover-menu');
    if (!surface) return;
    // Layout height is already in UI coordinates and excludes the entrance transform.
    const measure = () => setMenuHeight(surface.offsetHeight || 160);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [open, props.available]);

  const placement = getToolbarMenuPosition(triggerRef.current, menuHeight);
  const dismiss = (keyboard: boolean) => {
    restoreFocus.current = keyboard;
    close();
  };
  return (
    <div className="relative" ref={menuRef}>
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        dataUi="content.toolbar.reset-all-button"
        title={translate('content.toolbar.clearPagePreparation')}
        aria-label={translate('content.toolbar.clearPagePreparation')}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!props.available}
        tone="danger"
        onClick={(event) => {
          event.stopPropagation();
          keyboardOpening.current = event.detail === 0;
          toggleMenu('reset-confirm');
        }}
      >
        <RotateCcw size={18} strokeWidth={2} />
      </ContentToolbarButton>
      {open ? (
        <ProductToolbarMenu
          placement={resolveToolbarMenuPlacement(props.displayMode, placement)}
          style={{
            width: 320,
            borderRadius: 'var(--sniptale-radius-md)',
            color: 'var(--sniptale-color-text-primary)',
            fontSize: 12,
            lineHeight: 1.5,
            ...resolveToolbarFloatingMenuStyle({
              anchorEl: triggerRef.current,
              displayMode: props.displayMode,
              menuHeight,
              menuWidth: 320,
              placement,
            }),
          }}
        >
          <div
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            className="flex flex-col gap-3 p-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
              const destination = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
              if (event.target !== destination) return;
              event.preventDefault();
              (event.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
            }}
          >
            <strong id={titleId}>{translate('content.toolbar.clearPagePreparation')}</strong>
            <p id={messageId}>{translate(RESET_MESSAGES[props.scope ?? 'all'])}</p>
            <div className="flex justify-end gap-2">
              <ProductActionButton
                compact
                tone="secondary"
                onClick={(event) => dismiss(event.detail === 0)}
              >
                {translate('common.actions.cancel')}
              </ProductActionButton>
              <ProductActionButton
                compact
                tone="danger"
                onClick={(event) => {
                  if (confirmed.current || !props.available) return;
                  confirmed.current = true;
                  dismiss(event.detail === 0);
                  props.onConfirm?.();
                }}
              >
                {translate('content.toolbar.clearPagePreparation')}
              </ProductActionButton>
            </div>
          </div>
        </ProductToolbarMenu>
      ) : null}
    </div>
  );
}
