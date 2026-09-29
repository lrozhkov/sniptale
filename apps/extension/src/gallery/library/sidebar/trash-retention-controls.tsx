import { ProductSelect, ProductToggle } from '@sniptale/ui/product-form-controls';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { LOCAL_STORAGE_RETENTION_DAY_OPTIONS } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';
import type { GalleryTrashRetentionProps } from './types';

export function TrashRetentionControls(props: GalleryTrashRetentionProps) {
  const policy = props.policy;
  const disabled = props.status !== 'ready' || !policy || props.saving;
  const enabled = policy?.trashCleanupEnabled ?? false;
  const dayOptions = LOCAL_STORAGE_RETENTION_DAY_OPTIONS.map((days) => ({
    value: String(days),
    label: `${days} ${translate('gallery.app.trashRetentionDaySuffix')}`,
  }));

  return (
    <section
      data-ui="gallery.trash.retention"
      aria-labelledby="gallery-trash-retention-title"
      className={[
        'space-y-2 rounded-[var(--sniptale-radius-sm)] border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] p-3',
      ].join(' ')}
    >
      <h2 id="gallery-trash-retention-title" className="text-sm font-semibold">
        {translate('gallery.app.trashRetentionTitle')}
      </h2>
      {props.status === 'loading' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.app.trashRetentionLoading')}
        </p>
      ) : null}
      {props.status === 'unavailable' ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.app.trashRetentionUnavailable')}
          </p>
          <button
            type="button"
            className={getControlSecondaryButtonClassName({ density: 'compact' })}
            onClick={props.onRetry}
          >
            {translate('gallery.app.trashRetentionRetry')}
          </button>
        </div>
      ) : null}
      {policy ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="gallery-trash-retention-enabled" className="min-w-0 text-xs">
              {translate('gallery.app.trashRetentionEnabled')}
            </label>
            <ProductToggle
              id="gallery-trash-retention-enabled"
              aria-label={translate('gallery.app.trashRetentionEnabled')}
              checked={enabled}
              disabled={disabled}
              size="sm"
              onClick={() => props.onChange({ trashCleanupEnabled: !enabled })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="gallery-trash-retention-days" className="text-xs">
              {translate('gallery.app.trashRetentionDays')}
            </label>
            <ProductSelect<string>
              id="gallery-trash-retention-days"
              aria-label={translate('gallery.app.trashRetentionDays')}
              controlSize="sm"
              disabled={disabled || !enabled}
              options={dayOptions}
              value={String(policy.trashRetentionDays ?? 30)}
              onChange={(days) => props.onChange({ trashRetentionDays: Number(days) })}
            />
          </div>
        </>
      ) : null}
      <p className="text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.trashRetentionExplanation')}
      </p>
      {props.saving ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.app.trashRetentionSaving')}
        </p>
      ) : props.feedback === 'saved' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.app.trashRetentionSaved')}
        </p>
      ) : props.feedback === 'error' ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.app.trashRetentionSaveFailed')}
          </p>
          <button
            type="button"
            className={getControlSecondaryButtonClassName({ density: 'compact' })}
            onClick={props.onRetry}
          >
            {translate('gallery.app.trashRetentionRetry')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
