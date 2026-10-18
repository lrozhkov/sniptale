import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { RotateCw } from 'lucide-react';
import { createSafeExternalHref } from '@sniptale/platform/security/safe-url';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { translate } from '../../../platform/i18n';
import { isGalleryScenarioExportItem, type GalleryItem } from '../items';
import { getPreviewOrigin, usePreviewSourceMetadata } from './source-metadata';

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="gallery-preview-property">
      <dt className="text-[var(--sniptale-color-text-secondary)]">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

/** Read-only provenance and recording summary for the selected library item. */
export function PreviewSourceField({
  item,
  trashMode,
}: {
  item: GalleryItem;
  trashMode?: boolean;
}) {
  const metadata = usePreviewSourceMetadata(item);
  const href = createSafeExternalHref(item.sourceUrl);
  const title =
    item.sourceTitle?.trim() || (isGalleryScenarioExportItem(item) ? item.project.name : null);
  return (
    <section
      key={item.id}
      data-ui="gallery.preview.source"
      className="mt-1"
      aria-label={translate('gallery.preview.source')}
    >
      <div className="space-y-2 text-[13px] font-normal leading-[18px]">
        <dl className="gallery-preview-properties">
          <SourceRow
            label={translate('gallery.preview.origin')}
            value={translate(getPreviewOrigin(item))}
          />
          {metadata.summary?.method ? (
            <SourceRow
              label={translate('gallery.preview.captureMethod')}
              value={translate(metadata.summary.method)}
            />
          ) : null}
          {metadata.summary ? (
            <>
              <SourceRow
                label={translate('gallery.preview.recordedActions')}
                value={String(metadata.summary.actionCount)}
              />
              <SourceRow
                label={translate('gallery.preview.cursorHistory')}
                value={translate(
                  metadata.summary.hasPointer
                    ? 'gallery.preview.available'
                    : 'gallery.preview.notRecorded'
                )}
              />
            </>
          ) : null}
          {isGalleryScenarioExportItem(item) ? (
            <>
              <SourceRow label={translate('gallery.preview.type')} value={item.format} />
              <SourceRow
                label={translate('gallery.preview.exportSourceProject')}
                value={item.project.name}
              />
            </>
          ) : null}
        </dl>
        {isGalleryScenarioExportItem(item) &&
        (item.project.availability !== 'available' || item.lifecycle?.trashedAt !== undefined) ? (
          <p role="status">{translate('gallery.preview.exportSourceUnavailable')}</p>
        ) : null}
        {title ? <p className="break-words">{title}</p> : null}
        {href && !trashMode ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-[var(--sniptale-color-info)] hover:underline"
          >
            {item.sourceUrl}
          </a>
        ) : item.sourceUrl || !title ? (
          <p className="break-all">
            {item.sourceUrl || translate('gallery.preview.sourceMissing')}
          </p>
        ) : null}
        {metadata.status === 'loading' ? (
          <p role="status">{translate('gallery.preview.sourceLoading')}</p>
        ) : null}
        {metadata.status === 'missing' ? (
          <p role="status">{translate('gallery.preview.sourceUnavailable')}</p>
        ) : null}
        {metadata.status === 'unavailable' ? (
          <div>
            <p>{translate('gallery.preview.sourceUnavailable')}</p>
            <ProductActionButton
              compact
              tone="secondary"
              type="button"
              className={getControlSecondaryButtonClassName({ density: 'compact' })}
              onClick={metadata.retry}
            >
              <RotateCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              {translate('gallery.preview.retrySource')}
            </ProductActionButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}
