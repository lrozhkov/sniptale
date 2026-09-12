import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { GuideStyle } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { Translate } from '../../platform/i18n';
import { GuideStyleFields } from './style-controls';

/** One disposable draft and focus lifecycle applies project defaults as a single edit. */
export function GuideDefaultAppearance({
  style,
  disabled,
  onApply,
  onClose,
  t,
}: {
  style: GuideStyle;
  disabled: boolean;
  onApply: (style: GuideStyle, resetSteps: boolean) => void;
  onClose: () => void;
  t: Translate;
}) {
  const [draft, setDraft] = useState(style);
  const [resetSteps, setResetSteps] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const theme = useResolvedPortalTheme(anchor.current);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = container.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      dialog.setAttribute('aria-modal', 'true');
      dialog.tabIndex = -1;
      (dialog.querySelector<HTMLElement>('button:not(:disabled)') ?? dialog).focus();
    }
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, [tabindex]')].filter(
      (node) =>
        node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]')
    );
    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement;
    if (!first) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey ? active === first || active === dialog : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };
  return (
    <>
      <span ref={anchor} />
      {createPortal(
        <div ref={container} data-theme={theme ?? undefined} className="sniptale-ai-modal-root">
          <ProductModal
            onClose={onClose}
            onKeyDown={keyboard}
            labelledBy={titleId}
            width="min(620px, calc(100vw - 32px))"
            maxHeight="calc(100dvh - 32px)"
            scrollable
          >
            <ProductModalHeader
              compact
              title={<span id={titleId}>{t('scenario.editor.guideDefaultAppearance')}</span>}
              onClose={onClose}
              closeTitle={t('scenario.editor.close')}
            />
            <ProductModalBody compact>
              <GuideStyleFields
                style={draft}
                disabled={disabled}
                t={t}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              />
              <label className="guide-number-toggle">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={resetSteps}
                  onChange={(event) => setResetSteps(event.target.checked)}
                />
                {t('scenario.editor.guideApplyAppearanceToAll')}
              </label>
            </ProductModalBody>
            <ProductModalFooter compact>
              <ProductActionButton tone="secondary" compact onClick={onClose}>
                {t('common.actions.cancel')}
              </ProductActionButton>
              <ProductActionButton
                tone="primary"
                compact
                disabled={disabled}
                onClick={() => {
                  onApply(draft, resetSteps);
                  onClose();
                }}
              >
                {t('scenario.editor.guideApplyAppearance')}
              </ProductActionButton>
            </ProductModalFooter>
          </ProductModal>
        </div>,
        resolveThemeSafePortalTarget(anchor.current)
      )}
    </>
  );
}
