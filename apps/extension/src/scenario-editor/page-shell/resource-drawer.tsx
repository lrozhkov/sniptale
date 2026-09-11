import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Image, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductModal } from '@sniptale/ui/product-modal';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { Translate } from '../../platform/i18n';

type ResourceDrawerProps = {
  children: ReactNode;
  t: Translate;
};

/** Owns only the transient resource drawer; its mounted import child owns cancellation and selection. */
export function GuideResourceDrawer(props: ResourceDrawerProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const theme = useResolvedPortalTheme(anchor.current);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span ref={anchor} className="guide-resource-drawer-anchor">
      <ContentToolbarButton
        type="button"
        title={props.t('scenario.editor.guideOpenImageLibrary')}
        aria-expanded={open}
        aria-controls="guide-resource-drawer"
        onClick={() => setOpen(true)}
      >
        <Image size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {open &&
        createPortal(
          <div data-theme={theme ?? undefined} className="sniptale-ai-modal-root">
            <GuideResourceDialog onClose={close} {...props} />
          </div>,
          resolveThemeSafePortalTarget(anchor.current)
        )}
    </span>
  );
}

function GuideResourceDialog({ onClose, ...props }: ResourceDrawerProps & { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <ProductModal
      onClose={onClose}
      width="min(1440px, calc(100vw - 32px))"
      maxWidth="100vw"
      maxHeight="100dvh"
      role="presentation"
      dialogClassName="guide-resource-drawer-surface"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]'
          ) ?? []),
        ].filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden]'));
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first) {
          event.preventDefault();
          panel.current?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <aside
        ref={panel}
        id="guide-resource-drawer"
        className="guide-resource-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={props.t('scenario.editor.guideResources')}
        tabIndex={-1}
      >
        <header className="guide-resource-drawer-heading">
          <h2>{props.t('scenario.editor.guideResources')}</h2>
          <ContentToolbarButton
            type="button"
            title={props.t('scenario.editor.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </header>
        <div className="guide-resource-drawer-body">
          <div>{props.children}</div>
        </div>
      </aside>
    </ProductModal>
  );
}
