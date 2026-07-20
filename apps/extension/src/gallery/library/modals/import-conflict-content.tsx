import { FolderArchive } from 'lucide-react';
import type { MediaHubImportConflictStrategy } from '../../../workflows/media-hub-backup/index';
import { translate } from '../../../platform/i18n';
import { GalleryModalFrame } from './frame';
import type { ImportConflictModalProps } from './types';

const importManifestClassName =
  'mt-5 rounded-[16px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_36%,var(--sniptale-color-border-soft)_64%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_88%,var(--sniptale-color-surface-panel)_12%)] ' +
  'px-4 py-4 text-sm text-[var(--sniptale-color-text-primary)]';

const replaceStrategyClassName =
  'rounded-[16px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)] ' +
  [
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_66%,var(--sniptale-color-surface-panel)_34%)]',
    'px-4 py-4 text-left text-sm transition ',
  ].join('') +
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_48%,var(--sniptale-color-border-soft)_52%)]';

const skipStrategyClassName =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] ' +
  'px-4 py-4 text-left text-sm transition hover:border-[var(--sniptale-color-border-strong)] ' +
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]';

const duplicateStrategyClassName =
  'rounded-[16px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)] ' +
  'px-4 py-4 text-left text-sm transition ' +
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-info)_48%,var(--sniptale-color-border-soft)_52%)]';

const importBadgeClassName =
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)] text-[var(--sniptale-color-info)]';

const importSummaryStatClassName =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] ' +
  'px-4 py-4';

const replaceDescriptionClassName =
  'text-[color:color-mix(in_srgb,var(--sniptale-color-danger)_78%,var(--sniptale-color-text-secondary)_22%)]';

const duplicateDescriptionClassName =
  'text-[color:color-mix(in_srgb,var(--sniptale-color-info)_80%,var(--sniptale-color-text-secondary)_20%)]';

function ImportSummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={importSummaryStatClassName}>
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--sniptale-color-text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[var(--sniptale-color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function ImportSummaryStats({ summary }: Pick<ImportConflictModalProps, 'summary'>) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <ImportSummaryStat
        label={translate('gallery.importModal.assets')}
        value={summary.assetCount}
      />
      <ImportSummaryStat
        label={translate('gallery.importModal.thumbnails')}
        value={summary.thumbnailCount}
      />
      <ImportSummaryStat
        label={translate('gallery.importModal.conflicts')}
        value={summary.conflicts.length}
      />
    </div>
  );
}

function ImportManifestBanner({ summary }: Pick<ImportConflictModalProps, 'summary'>) {
  return (
    <div className={importManifestClassName}>
      {translate('gallery.importModal.formatVersionPrefix')} {summary.manifest.version}.{' '}
      {translate('gallery.importModal.exportedAtPrefix')}{' '}
      {new Date(summary.manifest.exportedAt).toLocaleString('ru-RU')}.
    </div>
  );
}

function ImportStrategyCard({
  strategy,
  title,
  description,
  titleClassName,
  className,
  descriptionClassName,
  onImport,
}: {
  strategy: MediaHubImportConflictStrategy;
  title: string;
  description: string;
  titleClassName: string;
  className: string;
  descriptionClassName: string;
  onImport: ImportConflictModalProps['onImport'];
}) {
  return (
    <button type="button" onClick={() => void onImport(strategy)} className={className}>
      <div className={`font-semibold ${titleClassName}`}>{title}</div>
      <div className={`mt-1 ${descriptionClassName}`}>{description}</div>
    </button>
  );
}

function ImportStrategyGrid({ onImport }: Pick<ImportConflictModalProps, 'onImport'>) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <ImportStrategyCard
        strategy="replace"
        title={translate('gallery.importModal.replaceTitle')}
        description={translate('gallery.importModal.replaceDescription')}
        titleClassName="text-[var(--sniptale-color-danger)]"
        className={replaceStrategyClassName}
        descriptionClassName={replaceDescriptionClassName}
        onImport={onImport}
      />
      <ImportStrategyCard
        strategy="skip"
        title={translate('gallery.importModal.skipTitle')}
        description={translate('gallery.importModal.skipDescription')}
        titleClassName="text-[var(--sniptale-color-text-primary)]"
        className={skipStrategyClassName}
        descriptionClassName="text-[var(--sniptale-color-text-secondary)]"
        onImport={onImport}
      />
      <ImportStrategyCard
        strategy="duplicate"
        title={translate('gallery.importModal.duplicateTitle')}
        description={translate('gallery.importModal.duplicateDescription')}
        titleClassName="text-[var(--sniptale-color-info)]"
        className={duplicateStrategyClassName}
        descriptionClassName={duplicateDescriptionClassName}
        onImport={onImport}
      />
    </div>
  );
}

export function ImportConflictModalContent({
  summary,
  onClose,
  onImport,
}: ImportConflictModalProps) {
  return (
    <GalleryModalFrame
      badgeIcon={FolderArchive}
      badgeLabel={translate('gallery.importModal.badge')}
      badgeClassName={importBadgeClassName}
      title={translate('gallery.importModal.title')}
      description={translate('gallery.importModal.description')}
      maxWidthClassName="max-w-2xl"
      panelClassName="rounded-[16px]"
      titleClassName="text-2xl"
      onClose={onClose}
    >
      <ImportSummaryStats summary={summary} />
      <ImportManifestBanner summary={summary} />
      <ImportStrategyGrid onImport={onImport} />
    </GalleryModalFrame>
  );
}
