import { translate } from '../../../../platform/i18n';

export function PreviewEffectRuntimeError(props: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-ui="video.preview.effect-runtime-error"
      className={[
        'absolute inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_72%,var(--sniptale-color-surface-panel)_28%)]',
        'text-xs font-medium text-[var(--sniptale-color-danger)] shadow-lg',
      ].join(' ')}
    >
      <span>{translate('videoEditor.stage.effectRuntimeFailure')}</span>
      <button
        type="button"
        onClick={props.onRetry}
        className={[
          'shrink-0 rounded-md border px-2.5 py-1 font-semibold transition-colors',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_38%,var(--sniptale-color-border-soft)_62%)]',
          'bg-[color:var(--sniptale-color-surface-panel)] hover:bg-[color:var(--sniptale-color-surface-raised)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        ].join(' ')}
      >
        {translate('videoEditor.stage.effectRuntimeRetry')}
      </button>
    </div>
  );
}
