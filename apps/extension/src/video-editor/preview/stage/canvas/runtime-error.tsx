import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n';

export function PreviewEffectRuntimeError(props: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-ui="video.preview.effect-runtime-error"
      className={[
        'absolute inset-x-4 bottom-4 z-50 flex flex-wrap items-center justify-between gap-3',
        'rounded-[4px] border px-3 py-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_72%,var(--sniptale-color-surface-panel)_28%)]',
        'text-sm leading-5 font-normal text-[var(--sniptale-color-danger)] shadow-lg',
      ].join(' ')}
    >
      <span>{translate('videoEditor.stage.effectRuntimeFailure')}</span>
      <ProductActionButton
        type="button"
        compact
        tone="secondary"
        onClick={props.onRetry}
        className="shrink-0"
      >
        {translate('videoEditor.stage.effectRuntimeRetry')}
      </ProductActionButton>
    </div>
  );
}
