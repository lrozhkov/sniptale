import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ProductModal } from './index';
import { resolveThemeSafePortalTarget, useResolvedPortalTheme } from '../theme/safe-portal';
export function NativeDrawer(props: {
  anchor: HTMLElement | null;
  title: string;
  dataUi: string;
  onClose(): void;
  containKeys?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useResolvedPortalTheme(props.anchor);
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      role="dialog"
      data-theme={theme ?? undefined}
      aria-label={props.title}
      onKeyDown={props.containKeys ? (event) => event.stopPropagation() : undefined}
      onKeyUp={props.containKeys ? (event) => event.stopPropagation() : undefined}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <ProductModal
        onClose={props.onClose}
        width="max(960px, 80vw)"
        maxWidth="calc(100vw - 24px)"
        maxHeight="100vh"
        role="presentation"
        dialogClassName={[
          '!bottom-0 !left-0 !top-0 !h-screen !transform-none !rounded-none !border-l-0',
          '!bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
        ].join(' ')}
      >
        <div className="flex h-full min-h-0 flex-col" data-ui={props.dataUi}>
          {props.children}
        </div>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}
