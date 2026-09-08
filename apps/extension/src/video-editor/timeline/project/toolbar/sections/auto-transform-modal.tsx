import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';
import { ArrowRight, Check, WandSparkles } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';

/** This modal owns focus while visible; original-interval viewing returns control to the editor. */
export function AutoProcessingModal(props: {
  onClose: () => void;
  onVisibilityChange: (visible: boolean) => void;
  applying: boolean;
  step: 'setup' | 'review';
  children: ReactNode;
}) {
  const { onVisibilityChange } = props;
  useLayoutEffect(() => {
    onVisibilityChange(true);
    return () => onVisibilityChange(false);
  }, [onVisibilityChange]);
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useLayoutEffect(() => {
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const document = dialog.ownerDocument;
    const opener = document.activeElement;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), summary'
        ),
      ].filter((node) => !node.closest('details:not([open])') || node.tagName === 'SUMMARY');
    const handleKey = (event: KeyboardEvent) => {
      const layers = getOwnedFloatingInteractionLayers(dialog, document);
      if (event.key === 'Escape' && !event.defaultPrevented && !layers.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const available = controls();
      const layer = layers.find((item) => item.contains(document.activeElement));
      if (layer) {
        const ownerIndex = available.findIndex(
          (item) => item.getAttribute('aria-controls') === layer.id
        );
        event.preventDefault();
        available[
          (ownerIndex + (event.shiftKey ? -1 : 1) + available.length) % available.length
        ]?.focus({ preventScroll: true });
      } else if (
        !dialog.contains(document.activeElement) ||
        document.activeElement === dialog ||
        (event.shiftKey
          ? document.activeElement === available[0]
          : document.activeElement === available.at(-1))
      ) {
        event.preventDefault();
        (event.shiftKey ? available.at(-1) : available[0])?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div ref={root}>
      <ProductModal
        onClose={props.onClose}
        closeOnBackdrop={false}
        width="min(820px, calc(100vw - 48px))"
        maxHeight="calc(100vh - 48px)"
        labelledBy={titleId}
      >
        <ProductModalHeader
          title={
            <span id={titleId} className="flex items-center gap-2">
              <WandSparkles size={18} aria-hidden="true" />
              {translate('videoEditor.timeline.autoTransformWizardTitle')}
            </span>
          }
          onClose={props.onClose}
          disabled={props.applying}
          closeTitle={translate('common.actions.close')}
        />
        <ol
          className={`flex shrink-0 items-center gap-3 border-b border-[var(--sniptale-color-border-soft)] px-6 py-3
text-xs`}
          aria-label={translate('videoEditor.timeline.autoSteps')}
        >
          <li
            aria-current={props.step === 'setup' ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full
bg-[var(--sniptale-color-surface-hover)]`}
            >
              {props.step === 'review' ? <Check size={12} aria-hidden="true" /> : '1'}
            </span>
            {translate('videoEditor.timeline.autoSetupStep')}
          </li>
          <ArrowRight
            size={12}
            aria-hidden="true"
            className="text-[var(--sniptale-color-text-secondary)]"
          />
          <li
            aria-current={props.step === 'review' ? 'step' : undefined}
            className={[
              'flex items-center gap-2',
              props.step === 'setup' ? 'text-[var(--sniptale-color-text-secondary)]' : '',
            ].join(' ')}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full
bg-[var(--sniptale-color-surface-hover)]`}
            >
              2
            </span>
            {translate('videoEditor.timeline.autoReviewStep')}
          </li>
        </ol>
        {props.children}
      </ProductModal>
    </div>
  );
}

/** Owns the editor overlay for the whole wizard, including the temporary original-view step. */
export function AutoProcessingLayer({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const opener = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const theme = useResolvedPortalTheme(anchor.current);
  useEffect(
    () => () => {
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    },
    []
  );
  return (
    <>
      <span ref={anchor} hidden />
      {createPortal(
        <div
          data-ui="video-editor.auto.layer"
          data-theme={theme ?? undefined}
          className="text-[var(--sniptale-color-text-primary)]"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>,
        resolveThemeSafePortalTarget(anchor.current)
      )}
    </>
  );
}
