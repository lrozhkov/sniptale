import { useEffect } from 'react';
import type { CSSProperties, FormEventHandler, ReactNode } from 'react';

let modalScrollLockCount = 0;
let originalDocumentOverflow = '';
let originalBodyOverflow = '';

function acquireModalScrollLock(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (modalScrollLockCount === 0) {
    originalDocumentOverflow = document.documentElement.style.overflow;
    originalBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  modalScrollLockCount += 1;
  return () => {
    modalScrollLockCount = Math.max(0, modalScrollLockCount - 1);
    if (modalScrollLockCount === 0) {
      document.documentElement.style.overflow = originalDocumentOverflow;
      document.body.style.overflow = originalBodyOverflow;
    }
  };
}

export interface ProductModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  backdropClassName?: string;
  width?: CSSProperties['width'];
  maxWidth?: CSSProperties['maxWidth'];
  maxHeight?: CSSProperties['maxHeight'];
  scrollable?: boolean;
  children: ReactNode;
  dialogClassName?: string;
  bodyClassName?: string;
  role?: string;
  labelledBy?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export interface ProductModalHeaderProps {
  title: ReactNode;
  onClose?: () => void;
  compact?: boolean;
  disabled?: boolean;
  closeTitle?: string;
  actions?: ReactNode;
}

export interface ProductModalBodyProps {
  children: ReactNode;
  compact?: boolean;
  asForm?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
}

export interface ProductModalFooterProps {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}

function getProductModalClassName(props: { dialogClassName: string; scrollable: boolean }) {
  return [
    'sniptale-modal',
    'sniptale-ai-modal-root',
    props.scrollable ? 'sniptale-modal-scroll' : '',
    props.dialogClassName,
  ]
    .filter(Boolean)
    .join(' ');
}

function getProductModalBackdropClassName(backdropClassName: string) {
  return backdropClassName
    ? `sniptale-modal-backdrop ${backdropClassName}`
    : 'sniptale-modal-backdrop';
}

function getProductModalStyle(props: {
  maxHeight: CSSProperties['maxHeight'];
  maxWidth: CSSProperties['maxWidth'];
  width: CSSProperties['width'];
}): CSSProperties {
  return {
    width: props.width,
    maxWidth: props.maxWidth,
    maxHeight: props.maxHeight,
    pointerEvents: 'auto',
  };
}

export function ProductModal({
  isOpen = true,
  onClose,
  closeOnBackdrop = true,
  backdropClassName = '',
  width,
  maxWidth,
  maxHeight,
  scrollable = false,
  children,
  dialogClassName = '',
  role = 'dialog',
  labelledBy,
  onKeyDown,
}: ProductModalProps) {
  useEffect(() => (isOpen ? acquireModalScrollLock() : undefined), [isOpen]);

  if (!isOpen) {
    return null;
  }

  const modalClassName = getProductModalClassName({ dialogClassName, scrollable });
  const modalStyle = getProductModalStyle({ maxHeight, maxWidth, width });
  const resolvedBackdropClassName = getProductModalBackdropClassName(backdropClassName);

  return (
    <>
      <div
        className={resolvedBackdropClassName}
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{ pointerEvents: 'auto' }}
        aria-hidden
      />
      <div
        className={modalClassName}
        style={modalStyle}
        role={role}
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </>
  );
}

export function ProductModalHeader({
  title,
  onClose,
  compact = false,
  disabled = false,
  closeTitle,
  actions,
}: ProductModalHeaderProps) {
  return (
    <div className={compact ? 'sniptale-modal-header-sm' : 'sniptale-modal-header'}>
      <div className={compact ? 'sniptale-modal-title-sm' : 'sniptale-modal-title'}>{title}</div>
      {actions ?? (
        <button
          type="button"
          className={
            compact ? 'sniptale-modal-close sniptale-modal-close-sm' : 'sniptale-modal-close'
          }
          onClick={onClose}
          disabled={disabled}
          title={closeTitle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ProductModalBody({
  children,
  compact = false,
  asForm = false,
  onSubmit,
  className = '',
}: ProductModalBodyProps) {
  const resolvedClassName = [compact ? 'sniptale-modal-body-sm' : 'sniptale-modal-body', className]
    .filter(Boolean)
    .join(' ');

  if (asForm) {
    return (
      <form onSubmit={onSubmit} className={resolvedClassName}>
        {children}
      </form>
    );
  }

  return <div className={resolvedClassName}>{children}</div>;
}

export function ProductModalFooter({
  children,
  compact = false,
  className = '',
}: ProductModalFooterProps) {
  return (
    <div
      className={[compact ? 'sniptale-modal-footer-sm' : 'sniptale-modal-footer', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
