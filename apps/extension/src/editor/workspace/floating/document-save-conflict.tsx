import { AlertCircle, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import {
  isComposedEventWithinAnyElement,
  getComposedEventTargetElement,
} from '@sniptale/ui/dom-events';
import { translate } from '../../../platform/i18n';
import { EditorIconButton } from '../../chrome/ui';

interface DocumentSaveErrorProps {
  conflict: boolean;
  pending: boolean;
  onSaveCopy: () => Promise<void>;
}

function useErrorPosition(anchor: HTMLElement | null, layer: HTMLDivElement | null) {
  const [position, setPosition] = useState<{ style: CSSProperties; arrow: number }>({
    style: { position: 'fixed', visibility: 'hidden', width: 340 },
    arrow: 24,
  });
  useLayoutEffect(() => {
    if (!anchor || !layer) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = anchor.ownerDocument.defaultView!;
      const width = Math.min(340, viewport.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left - 20, viewport.innerWidth - width - 12));
      const toolbar = anchor.closest('.sniptale-toolbar-root')?.getBoundingClientRect();
      const top = Math.max(rect.bottom, toolbar?.bottom ?? rect.bottom) + 12;
      setPosition({
        style: {
          position: 'fixed',
          left,
          top,
          width,
          maxHeight: Math.max(80, viewport.innerHeight - top - 32),
          zIndex: 2147483647,
        },
        arrow: Math.max(12, Math.min(width - 20, rect.left + rect.width / 2 - left)),
      });
    };
    const unbind = bindFloatingInteractionPositionListeners(anchor, update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(anchor);
    observer?.observe(layer);
    return () => {
      unbind?.();
      observer?.disconnect();
    };
  }, [anchor, layer]);
  return position;
}

function useErrorPopover() {
  const [open, setOpen] = useState(true);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const manualOpen = useRef(false);
  const position = useErrorPosition(anchor, layer);
  const close = () => {
    setOpen(false);
    anchor?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    setLayer(open ? layerRef.current : null);
  }, [open, anchor]);
  useEffect(() => {
    if (!open || !anchor) return;
    if (manualOpen.current) {
      layerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      manualOpen.current = false;
    }
    const owner = anchor.ownerDocument;
    const outside = (event: PointerEvent) => {
      if (!isComposedEventWithinAnyElement(event, [anchor, layerRef.current])) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = getComposedEventTargetElement(event);
      if (
        target?.closest('[data-floating-ui-root]') &&
        !isComposedEventWithinAnyElement(event, [layerRef.current])
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      anchor.focus({ preventScroll: true });
    };
    owner.addEventListener('pointerdown', outside, true);
    owner.addEventListener('keydown', escape, true);
    return () => {
      owner.removeEventListener('pointerdown', outside, true);
      owner.removeEventListener('keydown', escape, true);
    };
  }, [anchor, open]);

  return { open, setOpen, anchor, setAnchor, layerRef, manualOpen, position, close };
}

export function DocumentSaveError(props: DocumentSaveErrorProps) {
  const { open, setOpen, anchor, setAnchor, layerRef, manualOpen, position, close } =
    useErrorPopover();

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        data-state="error"
        title={translate('common.states.error')}
        aria-label={translate('common.states.error')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'editor-save-error' : undefined}
        data-ui="editor.floating.document-bar.error-trigger"
        className={[
          'inline-flex items-center gap-1 rounded px-0.5 text-[var(--sniptale-color-danger)]',
          'outline-none focus-visible:ring-1 focus-visible:ring-current',
          'hover:bg-[var(--sniptale-color-surface-hover)]',
        ].join(' ')}
        onClick={() => {
          manualOpen.current = !open;
          setOpen(!open);
        }}
      >
        <AlertCircle size={12} aria-hidden="true" />
        {translate('common.states.error')}
      </button>
      <ContentPopoverAdapter
        anchorEl={anchor}
        isOpen={open}
        popoverRef={layerRef}
        dataUi="editor.floating.document-bar.save-error"
        className={[
          'sniptale-content-popover--compact !w-[min(340px,calc(100vw-24px))]',
          '!bg-[var(--sniptale-color-surface-panel)] backdrop-blur-[12px]',
        ].join(' ')}
        style={position.style}
      >
        <span
          aria-hidden="true"
          className={[
            'absolute -top-1.5 size-3 rotate-45 border-l border-t',
            'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          style={{ left: position.arrow - 6 }}
        />
        <div
          id="editor-save-error"
          role="dialog"
          data-floating-ui-root="true"
          aria-labelledby="editor-save-error-title"
          className="relative space-y-3 overflow-y-auto p-2"
          style={{ maxHeight: position.style.maxHeight }}
        >
          <div className="flex items-start gap-2">
            <AlertCircle
              size={16}
              className="mt-0.5 shrink-0 text-[var(--sniptale-color-danger)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h3
                id="editor-save-error-title"
                className="text-sm font-medium text-[var(--sniptale-color-text-primary)]"
              >
                {translate(
                  props.conflict
                    ? 'editor.documentActions.conflictTitle'
                    : 'editor.documentActions.saveErrorTitle'
                )}
              </h3>
            </div>
            <EditorIconButton
              title={translate('common.actions.close')}
              onClick={close}
              className="!h-6 !w-6"
            >
              <X size={14} />
            </EditorIconButton>
          </div>
          <p
            role="alert"
            className="text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]"
          >
            {props.conflict
              ? translate('editor.documentActions.conflictDescription')
              : translate('editor.documentActions.saveErrorDescription')}
          </p>
          {props.conflict ? (
            <div className="grid gap-2">
              <ProductActionButton
                compact
                tone="primary"
                disabled={props.pending}
                aria-busy={props.pending}
                onClick={() => void props.onSaveCopy().catch(() => undefined)}
              >
                {translate('editor.documentActions.saveCopy')}
              </ProductActionButton>
              <ProductActionButton
                compact
                tone="secondary"
                disabled={props.pending}
                onClick={() => window.location.reload()}
              >
                {translate('editor.documentActions.reloadLatest')}
              </ProductActionButton>
            </div>
          ) : null}
        </div>
      </ContentPopoverAdapter>
    </>
  );
}
