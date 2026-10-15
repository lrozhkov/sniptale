import { ChevronDown, Info } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductSelect, ProductToggle } from '@sniptale/ui/product-form-controls';
import { LOCAL_STORAGE_RETENTION_DAY_OPTIONS } from '../../../composition/persistence/library-lifecycle';
import { translate } from '../../../platform/i18n';
import type { GalleryTrashRetentionProps } from './types';

const detailsTriggerClassName = [
  'flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-[4px] px-2',
  '[&::-webkit-details-marker]:hidden hover:text-[var(--sniptale-color-text-primary)]',
  'focus-visible:outline-2',
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
      <div className="flex min-h-8 items-center justify-between gap-2">
        <label
          htmlFor="gallery-trash-retention-enabled"
          className="min-w-0 text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]"
        >
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
          <div className="flex min-h-8 min-w-0 items-center justify-between gap-2">
            <label
              htmlFor="gallery-trash-retention-days"
              className="min-w-0 text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]"
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
          <details className="group/retention text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
            <summary className={detailsTriggerClassName}>
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-medium">
                {translate('gallery.app.trashRetentionDetails')}
              </span>
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open/retention:rotate-180
                  motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <p className="pl-[30px] pr-2 pt-2 text-sm leading-5 font-normal">
              {translate('gallery.app.trashRetentionExplanation')}
            </p>
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
      <h3 className="text-sm leading-5 font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.trashRetentionTitle')}
      </h3>
      {props.status === 'loading' ? (
        <p
          role="status"
          className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('gallery.app.trashRetentionLoading')}
        </p>
      ) : null}
      {props.status === 'unavailable' ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.app.trashRetentionUnavailable')}
          </p>
          <ProductActionButton tone="secondary" compact type="button" onClick={props.onRetry}>
            {translate('gallery.app.trashRetentionRetry')}
          </ProductActionButton>
        </div>
      ) : null}
      <TrashRetentionSettings {...props} />
      {props.saving ? (
        <p
          role="status"
          className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('gallery.app.trashRetentionSaving')}
        </p>
      ) : props.feedback === 'error' ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.app.trashRetentionSaveFailed')}
          </p>
          <ProductActionButton tone="secondary" compact type="button" onClick={props.onRetry}>
            {translate('gallery.app.trashRetentionRetry')}
          </ProductActionButton>
        </div>
      ) : null}
    </section>
  );
}
