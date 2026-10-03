import { ProductSelect, ProductToggle } from '@sniptale/ui/product-form-controls';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { LOCAL_STORAGE_RETENTION_DAY_OPTIONS } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';
import type { GalleryTrashRetentionProps } from './types';

const detailsTriggerClassName = [
  'cursor-pointer rounded-sm focus-visible:outline-2',
  'focus-visible:outline-[var(--sniptale-color-accent)]',
].join(' ');

function TrashRetentionSettings(props: GalleryTrashRetentionProps) {
  const policy = props.policy;
  if (!policy) return null;
  const disabled = props.status !== 'ready' || !policy || props.saving;
  const enabled = policy.trashCleanupEnabled ?? false;
  const dayOptions = LOCAL_STORAGE_RETENTION_DAY_OPTIONS.map((days) => ({
    value: String(days),
    label: `${days} ${translate('gallery.app.trashRetentionDaySuffix')}`,
  }));

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="gallery-trash-retention-enabled" className="min-w-0 text-xs">
          {translate('gallery.app.trashRetentionEnabled')}
        </label>
        <ProductToggle
          id="gallery-trash-retention-enabled"
          aria-label={translate('gallery.app.trashRetentionEnabled')}
          checked={enabled}
          disabled={props.status !== 'ready'}
          aria-busy={props.saving}
          size="sm"
          onClick={() => {
            if (!props.saving) props.onChange({ trashCleanupEnabled: !enabled });
          }}
        />
      </div>
      {enabled ? (
        <>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <label
              htmlFor="gallery-trash-retention-days"
              className="shrink-0 whitespace-nowrap text-xs"
            >
              {translate('gallery.app.trashRetentionDays')}
            </label>
            <ProductSelect<string>
              id="gallery-trash-retention-days"
              aria-label={translate('gallery.app.trashRetentionDays')}
              controlSize="sm"
              containerClassName="!w-auto min-w-0 shrink-0"
              disabled={disabled}
              options={dayOptions}
              value={String(policy.trashRetentionDays ?? 30)}
              onChange={(days) => props.onChange({ trashRetentionDays: Number(days) })}
            />
          </div>
          <details className="text-xs text-[var(--sniptale-color-text-secondary)]">
            <summary className={detailsTriggerClassName}>
              {translate('gallery.app.trashRetentionDetails')}
            </summary>
            <p className="pt-2 leading-5">{translate('gallery.app.trashRetentionExplanation')}</p>
          </details>
        </>
      ) : null}
    </>
  );
}

export function TrashRetentionControls(props: GalleryTrashRetentionProps) {
  return (
    <section
      data-ui="gallery.trash.retention"
      aria-label={translate('gallery.app.trashRetentionTitle')}
      className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
    >
      <h3 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.trashRetentionTitle')}
      </h3>
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
      <TrashRetentionSettings {...props} />
      {props.saving ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.app.trashRetentionSaving')}
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
