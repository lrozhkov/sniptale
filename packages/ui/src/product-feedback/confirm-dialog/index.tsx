import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '../../product-modal';
import { ProductActionButton } from '../../product-modal/actions';

export interface ProductConfirmDialogProps {
  title: ReactNode;
  message: ReactNode;
  confirmText: ReactNode;
  cancelText: ReactNode;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  isOpen?: boolean;
  isLoading?: boolean;
  backdropClassName?: string;
  dialogClassName?: string;
}

function getProductConfirmBackdropClassName(backdropClassName: string) {
  return backdropClassName || undefined;
}

function getProductConfirmDialogClassName(dialogClassName: string) {
  return dialogClassName ? `sniptale-confirm-dialog ${dialogClassName}` : 'sniptale-confirm-dialog';
}

function renderConfirmDialogActions(props: {
  cancelText: ReactNode;
  confirmText: ReactNode;
  isLoading: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  return (
    <ProductModalFooter compact className="sniptale-confirm-actions">
      <ProductActionButton
        tone="secondary"
        compact
        onClick={props.onCancel}
        disabled={props.isLoading}
      >
        {props.cancelText}
      </ProductActionButton>
      <ProductActionButton
        tone="danger"
        compact
        onClick={props.onConfirm}
        disabled={props.isLoading}
      >
        {props.confirmText}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof value.then === 'function');
}

async function runConfirmDialogAction(props: {
  isControlledLoading: boolean;
  onConfirm: () => void | Promise<void>;
  setAutoLoading: (value: boolean) => void;
}) {
  let result: void | Promise<void>;
  try {
    result = props.onConfirm();
  } catch {
    return;
  }

  if (!props.isControlledLoading && isPromiseLike(result)) {
    props.setAutoLoading(true);
    try {
      await result;
    } catch {
      return;
    } finally {
      props.setAutoLoading(false);
    }
    return;
  }

  try {
    await result;
  } catch {
    // Confirm errors are surfaced by the owning workflow, not this shared dialog.
  }
}

function useConfirmDialogHandlers(props: {
  isLoading?: boolean;
  isOpen: boolean;
  onCancel?: () => void;
  onConfirm?: () => void | Promise<void>;
}) {
  const [autoLoading, setAutoLoading] = useState(false);

  useEffect(() => {
    if (!props.isOpen) {
      setAutoLoading(false);
    }
  }, [props.isOpen]);

  const isControlledLoading = typeof props.isLoading === 'boolean';
  const resolvedIsLoading = isControlledLoading ? Boolean(props.isLoading) : autoLoading;

  const handleCancel = () => {
    if (resolvedIsLoading) {
      return;
    }

    props.onCancel?.();
  };

  const handleConfirm = async () => {
    if (!props.onConfirm || resolvedIsLoading) {
      return;
    }

    await runConfirmDialogAction({
      isControlledLoading,
      onConfirm: props.onConfirm,
      setAutoLoading,
    });
  };

  return { handleCancel, handleConfirm, resolvedIsLoading };
}

function renderProductConfirmDialogModal(props: {
  cancelText: ReactNode;
  confirmText: ReactNode;
  dialogClassName: string;
  backdropClassName?: string;
  handleCancel: () => void;
  handleConfirm: () => Promise<void>;
  isLoading: boolean;
  message: ReactNode;
  title: ReactNode;
  titleId: string;
}) {
  return (
    <ProductModal
      dialogClassName={props.dialogClassName}
      closeOnBackdrop={!props.isLoading}
      onClose={props.handleCancel}
      role="alertdialog"
      labelledBy={props.titleId}
      width="min(440px, calc(100vw - 32px))"
      {...(props.backdropClassName === undefined
        ? {}
        : { backdropClassName: props.backdropClassName })}
    >
      <ProductModalHeader
        compact
        title={
          <span id={props.titleId} className="sniptale-confirm-title">
            {props.title}
          </span>
        }
        onClose={props.handleCancel}
        disabled={props.isLoading}
      />
      <ProductModalBody compact className="gap-3">
        <p className="sniptale-confirm-message">{props.message}</p>
      </ProductModalBody>
      {renderConfirmDialogActions({
        cancelText: props.cancelText,
        confirmText: props.confirmText,
        isLoading: props.isLoading,
        onCancel: props.handleCancel,
        onConfirm: () => {
          void props.handleConfirm();
        },
      })}
    </ProductModal>
  );
}

function useConfirmationFocus(isOpen: boolean, onCancel: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = containerRef.current?.querySelector<HTMLElement>('[role="alertdialog"]');
    if (!dialog) return;
    const root = dialog.getRootNode();
    const focusRoot = root instanceof ShadowRoot ? root : dialog.ownerDocument;
    const previous = focusRoot.activeElement;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const buttons = () => [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    (
      dialog.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button:not([disabled])') ??
      dialog
    ).focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog.contains(focusRoot.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelRef.current();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const targets = buttons();
        const active = focusRoot.activeElement;
        const index = targets.findIndex((target) => target === active);
        const next = (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
        (targets[next] ?? dialog).focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [isOpen]);
  return containerRef;
}

export function ProductConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isOpen = true,
  isLoading,
  backdropClassName = '',
  dialogClassName = '',
}: ProductConfirmDialogProps) {
  const resolvedBackdropClassName = getProductConfirmBackdropClassName(backdropClassName);
  const resolvedDialogClassName = getProductConfirmDialogClassName(dialogClassName);
  const { handleCancel, handleConfirm, resolvedIsLoading } = useConfirmDialogHandlers({
    isOpen,
    ...(isLoading === undefined ? {} : { isLoading }),
    ...(onCancel === undefined ? {} : { onCancel }),
    ...(onConfirm === undefined ? {} : { onConfirm }),
  });

  const titleId = useId();
  const containerRef = useConfirmationFocus(isOpen, handleCancel);

  if (!isOpen) {
    return null;
  }

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {renderProductConfirmDialogModal({
        cancelText,
        confirmText,
        dialogClassName: resolvedDialogClassName,
        handleCancel,
        handleConfirm,
        isLoading: resolvedIsLoading,
        message,
        title,
        titleId,
        ...(resolvedBackdropClassName === undefined
          ? {}
          : { backdropClassName: resolvedBackdropClassName }),
      })}
    </div>
  );
}
