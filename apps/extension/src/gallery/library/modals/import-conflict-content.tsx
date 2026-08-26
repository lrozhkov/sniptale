import { ArchiveRestore } from 'lucide-react';
import { useState } from 'react';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { MediaHubImportConflictStrategy } from '../../../workflows/media-hub-backup/index';
import { formatDateTime, getCurrentLocale, translate } from '../../../platform/i18n';
import { GalleryModalFrame } from './frame';
import type { ImportConflictModalProps } from './types';

const importSummaryClassName =
  'mt-4 divide-y divide-[var(--sniptale-color-border-soft)] rounded-[8px] border ' +
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-3';

const importSummaryRowClassName = 'flex min-h-10 items-center justify-between gap-4 py-2 text-sm';

const importSecondaryButtonClassName = getControlSecondaryButtonClassName({ density: 'compact' });

const importPrimaryButtonClassName = getControlPrimaryButtonClassName({ density: 'compact' });

const STRATEGIES: MediaHubImportConflictStrategy[] = ['skip', 'duplicate', 'replace'];

function getStrategyTitle(strategy: MediaHubImportConflictStrategy): string {
  switch (strategy) {
    case 'skip':
      return translate('gallery.importModal.skipTitle');
    case 'duplicate':
      return translate('gallery.importModal.duplicateTitle');
    case 'replace':
      return translate('gallery.importModal.replaceTitle');
  }
}

function getStrategyDescription(strategy: MediaHubImportConflictStrategy): string {
  switch (strategy) {
    case 'skip':
      return translate('gallery.importModal.skipDescription');
    case 'duplicate':
      return translate('gallery.importModal.duplicateDescription');
    case 'replace':
      return translate('gallery.importModal.replaceDescription');
  }
}

function ImportSummaryRow(props: { label: string; value: string | number }) {
  return (
    <div className={importSummaryRowClassName}>
      <span className="text-[var(--sniptale-color-text-secondary)]">{props.label}</span>
      <span className="font-medium text-[var(--sniptale-color-text-primary)]">{props.value}</span>
    </div>
  );
}

function ImportSummary({ summary }: Pick<ImportConflictModalProps, 'summary'>) {
  const exportedAt = formatDateTime(
    new Date(summary.manifest.exportedAt),
    { dateStyle: 'medium', timeStyle: 'short' },
    getCurrentLocale()
  );

  return (
    <div className={importSummaryClassName}>
      <ImportSummaryRow
        label={translate('gallery.importModal.assets')}
        value={summary.assetCount}
      />
      <ImportSummaryRow
        label={translate('gallery.importModal.thumbnails')}
        value={summary.thumbnailCount}
      />
      {summary.conflicts.length > 0 ? (
        <ImportSummaryRow
          label={translate('gallery.importModal.conflicts')}
          value={summary.conflicts.length}
        />
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 py-2 text-xs text-[var(--sniptale-color-text-muted)]">
        <span>
          {translate('gallery.importModal.exportedAtPrefix')} {exportedAt}
        </span>
        <span>
          {translate('gallery.importModal.formatVersionPrefix')} {summary.manifest.version}
        </span>
      </div>
    </div>
  );
}

function ImportStrategySelect(props: {
  disabled: boolean;
  onChange: (strategy: MediaHubImportConflictStrategy) => void;
  strategy: MediaHubImportConflictStrategy;
}) {
  return (
    <div className="mt-4">
      <label
        htmlFor="gallery-import-conflict-strategy"
        className="mb-1.5 block text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {translate('gallery.importModal.conflictActionLabel')}
      </label>
      <ProductSelect<MediaHubImportConflictStrategy>
        id="gallery-import-conflict-strategy"
        aria-label={translate('gallery.importModal.conflictActionLabel')}
        value={props.strategy}
        disabled={props.disabled}
        controlSize="md"
        containerClassName="w-full"
        className="w-full"
        options={STRATEGIES.map((strategy) => ({
          value: strategy,
          label: getStrategyTitle(strategy),
        }))}
        onChange={props.onChange}
      />
      <p className="mt-1.5 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {getStrategyDescription(props.strategy)}
      </p>
    </div>
  );
}

export function ImportConflictModalContent({
  fixedStrategy,
  summary,
  onClose,
  onImport,
}: ImportConflictModalProps) {
  const hasConflicts = summary.conflicts.length > 0;
  const [selectedStrategy, setSelectedStrategy] = useState<MediaHubImportConflictStrategy>(
    fixedStrategy ?? 'skip'
  );
  const strategy = fixedStrategy ?? selectedStrategy;

  return (
    <GalleryModalFrame
      title={translate('gallery.importModal.title')}
      description={translate(
        hasConflicts
          ? 'gallery.importModal.description'
          : 'gallery.importModal.noConflictsDescription'
      )}
      maxWidthClassName="max-w-lg"
      onClose={onClose}
    >
      <ImportSummary summary={summary} />
      {hasConflicts ? (
        <ImportStrategySelect
          disabled={fixedStrategy !== undefined}
          strategy={strategy}
          onChange={setSelectedStrategy}
        />
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={importSecondaryButtonClassName}>
          {translate('common.actions.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void onImport(strategy)}
          className={importPrimaryButtonClassName}
        >
          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.importModal.restore')}
        </button>
      </div>
    </GalleryModalFrame>
  );
}
