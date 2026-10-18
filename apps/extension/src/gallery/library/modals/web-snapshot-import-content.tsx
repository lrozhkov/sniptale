import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Globe2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, getCurrentLocale, translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import type { PendingWebSnapshotImportState } from '../import-types';
import { GalleryModalFrame } from './frame';

function SummaryRow(props: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 py-2 text-[13px] leading-[18px] font-medium">
      <span className="text-[var(--sniptale-color-text-secondary)]">{props.label}</span>
      <span className="min-w-0 break-words text-right font-medium" title={String(props.value)}>
        {props.value}
      </span>
    </div>
  );
}

export function WebSnapshotImportModalContent(props: {
  pending: PendingWebSnapshotImportState;
  onClose: () => void;
  onImport: () => Promise<void>;
}) {
  const [isImporting, setIsImporting] = useState(false);
  const { inspection } = props.pending;
  const capturedAt = formatDateTime(
    new Date(inspection.capturedAt),
    { dateStyle: 'medium', timeStyle: 'short' },
    getCurrentLocale()
  );
  const confirm = async () => {
    setIsImporting(true);
    try {
      await props.onImport();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <GalleryModalFrame
      title={translate('gallery.importModal.webSnapshotTitle')}
      description={translate('gallery.importModal.webSnapshotDescription')}
      maxWidthClassName="max-w-lg"
      onClose={props.onClose}
    >
      <div
        className="mt-4 divide-y divide-[var(--sniptale-color-border-soft)] rounded-[4px]
        border border-[var(--sniptale-color-border-soft)] px-3"
      >
        <SummaryRow
          label={translate('gallery.importModal.webSnapshotName')}
          value={inspection.sourceTitle ?? props.pending.file.name}
        />
        {inspection.sourceUrl ? (
          <SummaryRow
            label={translate('gallery.importModal.webSnapshotSource')}
            value={inspection.sourceUrl}
          />
        ) : null}
        <SummaryRow
          label={translate('gallery.importModal.webSnapshotCreated')}
          value={capturedAt}
        />
        <SummaryRow
          label={translate('gallery.importModal.webSnapshotSize')}
          value={formatBytes(inspection.archiveBytes)}
        />
        <SummaryRow
          label={translate('gallery.importModal.webSnapshotResources')}
          value={inspection.resourceCount}
        />
      </div>

      <div
        className="mt-3 flex items-start gap-2 rounded-[4px]
        bg-[var(--sniptale-color-surface-canvas)] px-3 py-2.5 text-sm leading-5 font-normal
        text-[var(--sniptale-color-text-secondary)]"
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sniptale-color-text-secondary)]" />
        <span>{translate('gallery.importModal.webSnapshotSafety')}</span>
      </div>

      {inspection.warnings.length > 0 ? (
        <div className="mt-3 select-text text-sm leading-5 font-normal text-[var(--sniptale-color-text-secondary)]">
          <div className="font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('gallery.importModal.webSnapshotWarnings')} · {inspection.warnings.length}
          </div>
          <ul className="mt-1 max-h-24 list-disc space-y-1 overflow-y-auto pl-4">
            {inspection.warnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <ProductActionButton
          compact
          type="button"
          disabled={isImporting}
          onClick={props.onClose}
          tone="secondary"
        >
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          compact
          type="button"
          disabled={isImporting}
          onClick={() => void confirm()}
        >
          {isImporting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Globe2 className="h-4 w-4" aria-hidden="true" />
          )}
          {translate(
            isImporting
              ? 'gallery.importModal.webSnapshotImporting'
              : 'gallery.importModal.webSnapshotImport'
          )}
        </ProductActionButton>
      </div>
    </GalleryModalFrame>
  );
}
