import { useEffect, useId, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { translate } from '../../../platform/i18n';
import { getGalleryPrimaryShortcut } from '../keyboard/shortcut-labels';

function CommandList(props: { commands: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
      {props.commands.map(([label, keys]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right font-mono text-[var(--sniptale-color-text-secondary)]">
            {keys}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function GalleryKeyboardHelpDialog(props: { onClose(): void }) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  const closeLabel = translate('common.actions.close');
  return (
    <ProductModal
      onClose={props.onClose}
      labelledBy={titleId}
      width="min(560px, calc(100vw - 40px))"
      maxHeight="calc(100vh - 40px)"
      scrollable
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) props.onClose();
        } else if (event.key === 'Tab') {
          const dialog = contentRef.current?.closest('[role="dialog"]');
          const controls = Array.from(
            dialog?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]'
            ) ?? []
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <ProductModalHeader
        compact
        title={<span id={titleId}>{translate('gallery.keyboard.title')}</span>}
        actions={
          <button
            ref={closeRef}
            type="button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={props.onClose}
            className="sniptale-dismiss-button flex h-8 w-8 items-center justify-center rounded-[8px]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        }
      />
      <ProductModalBody compact className="sniptale-modal-scroll overflow-y-auto">
        <div ref={contentRef} className="space-y-4 text-[var(--sniptale-color-text-primary)]">
          <section className="space-y-2">
            <h3 className="font-semibold">{translate('gallery.keyboard.list')}</h3>
            <CommandList
              commands={[
                [translate('gallery.keyboard.navigate'), '← ↑ ↓ →'],
                [translate('gallery.keyboard.edges'), 'Home / End'],
                [translate('gallery.keyboard.range'), 'Shift + ← ↑ ↓ →'],
                [translate('gallery.keyboard.toggle'), 'Space'],
                [translate('gallery.keyboard.open'), 'Enter'],
                [translate('gallery.app.selectAllResults'), getGalleryPrimaryShortcut('A')],
                [translate('gallery.app.clearSelection'), 'Escape'],
                [translate('gallery.app.searchLabel'), getGalleryPrimaryShortcut('F')],
                [translate('common.actions.delete'), 'Del'],
              ]}
            />
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">{translate('gallery.keyboard.preview')}</h3>
            <CommandList
              commands={[
                [translate('gallery.keyboard.previewNavigate'), '← / →'],
                [translate('gallery.keyboard.videoToggle'), 'Space'],
                [translate('gallery.keyboard.previewClose'), 'Escape'],
              ]}
            />
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">{translate('gallery.keyboard.text')}</h3>
            <p className="text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
              {translate('gallery.keyboard.textBody')}
            </p>
          </section>
        </div>
      </ProductModalBody>
    </ProductModal>
  );
}

export function GalleryKeyboardHelp() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const label = translate('gallery.keyboard.title');
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]
          text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
      >
        <Keyboard aria-hidden="true" className="h-4 w-4" />
      </button>
      {open ? <GalleryKeyboardHelpDialog onClose={close} /> : null}
    </>
  );
}
