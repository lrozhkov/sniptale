import type { ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef } from 'react';

import { translate } from '../../../../platform/i18n';
import { cx } from './utils';

type ExportSelectionSectionShellProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  drawerLabel: string;
  isExpanded?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  title: string;
};

const shellClassName = 'flex min-h-0 flex-col overflow-hidden';

const headerClassName = 'flex items-center justify-between gap-3 pb-1';

const actionButtonClassName = [
  'shrink-0 rounded-[9px] px-1.5 py-0.5 text-[11px] font-medium',
  'text-[var(--sniptale-color-text-primary)] transition-colors',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'outline-none focus-visible:outline-none',
].join(' ');

function useInlineDrawerDismiss(
  isOpen: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, rootRef]);
}

export function ExportSelectionSectionShell({
  bodyClassName,
  children,
  className,
  drawerLabel,
  isExpanded = false,
  isOpen,
  onClose,
  onOpen,
  title,
}: ExportSelectionSectionShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drawerId = useId();

  useInlineDrawerDismiss(isOpen, onClose, rootRef);

  return (
    <section ref={rootRef} className={cx(shellClassName, isExpanded && 'flex-1', className)}>
      <div className={headerClassName}>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--sniptale-color-text-dim)]">
            {title}
          </div>
        </div>
        <button
          type="button"
          aria-controls={drawerId}
          aria-expanded={isOpen}
          className={actionButtonClassName}
          onClick={isOpen ? onClose : onOpen}
        >
          {isOpen ? translate('popup.export.doneButton') : translate('popup.export.editButton')}
        </button>
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
