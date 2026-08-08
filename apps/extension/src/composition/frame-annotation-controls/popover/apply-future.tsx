import { useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';

export function useApplyToFutureFrames(onApply: (() => void) | undefined) {
  const [confirming, setConfirming] = useState(false);
  const request = () => {
    if (onApply) setConfirming(true);
  };
  const cancel = () => setConfirming(false);
  const confirm = () => {
    onApply?.();
    setConfirming(false);
  };

  return { cancel, confirm, confirming, request };
}

export function ApplyToFutureFramesGuard(props: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      aria-label={translate('content.templateFork.applyToFutureTitle')}
      className="grid gap-3 p-3"
      data-ui="content.template-fork.apply-to-future-guard"
      role="region"
    >
      <div className="grid gap-1">
        <div className="text-[13px] font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('content.templateFork.applyToFutureTitle')}
        </div>
        <div className="text-[11px] leading-4 text-[var(--sniptale-color-text-secondary)]">
          {translate('content.templateFork.applyToFutureDescription')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ProductActionButton compact onClick={props.onCancel} tone="secondary">
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton compact onClick={props.onConfirm}>
          {translate('content.templateFork.applyToFutureConfirm')}
        </ProductActionButton>
      </div>
    </div>
  );
}
