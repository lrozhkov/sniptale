import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { ProductDropdownItem, ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import type { ImageEditorSession } from './session';

/** Owns session-menu dismissal, keyboard focus and clear confirmation. */
export function ImageSessionMenu(props: { session: ImageEditorSession; disabled: boolean }) {
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(false);
  const shell = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !shell.current?.contains(event.target)) setOpen(false);
    };
    shell.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open]);
  return (
    <div
      ref={shell}
      className="relative shrink-0"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !shell.current?.contains(event.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
          event.stopPropagation();
        }
        if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          const buttons = [
            ...(shell.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
          ];
          const index = buttons.findIndex((button) => button === document.activeElement);
          const next =
            index < 0
              ? event.key === 'ArrowUp'
                ? buttons.length - 1
                : 0
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
          event.preventDefault();
        }
      }}
    >
      <EditorIconButton
        ref={trigger}
        title={translate('editor.ai.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={16} />
      </EditorIconButton>
      {open ? (
        <ProductDropdownMenu
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 !w-52 !min-w-0"
        >
          <ProductDropdownItem
            role="menuitem"
            onClick={() => {
              props.session.newTask();
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            {translate('editor.ai.newTask')}
          </ProductDropdownItem>
          <ProductDropdownItem
            role="menuitem"
            danger
            onClick={() => {
              setOpen(false);
              setConfirm(true);
            }}
          >
            {translate('editor.ai.clear')}
          </ProductDropdownItem>
        </ProductDropdownMenu>
      ) : null}
      {confirm ? (
        <ProductConfirmDialog
          title={translate('editor.ai.clearTitle')}
          message={translate('editor.ai.clearMessage')}
          confirmText={translate('editor.ai.confirmClear')}
          cancelText={translate('editor.ai.cancel')}
          onConfirm={() => {
            props.session.clear();
            setConfirm(false);
            trigger.current?.focus();
          }}
          onCancel={() => {
            setConfirm(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
