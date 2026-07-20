import { AlertTriangle, HardDrive, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { StorageCleanupGroup } from '../../../features/media-hub/types';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { formatDate } from '../ui';
import { GalleryModalFrame } from './frame';
import type { StorageManagerModalProps } from './types';

const storageItemClassName =
  'rounded-[12px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)] px-3 py-2.5 text-sm';

const storageCounterClassName =
  'rounded-[12px] border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)] ' +
  'px-3 py-2 text-right';

const storageWarningClassName =
  'inline-flex items-start gap-2 rounded-[12px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)] ' +
  [
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_52%,var(--sniptale-color-surface-panel)_48%)]',
    'px-3 py-2 text-xs text-[var(--sniptale-color-danger)]',
  ].join(' ');

const storageDeleteButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border ' +
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)] ' +
  [
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_58%,var(--sniptale-color-surface-panel)_42%)]',
    'px-4 py-2.5 text-sm font-semibold text-[var(--sniptale-color-danger)] ',
  ].join('') +
  'transition ' +
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_48%,var(--sniptale-color-border-soft)_52%)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-[var(--sniptale-color-danger)]';

const storageBadgeClassName =
  'border border-[var(--sniptale-color-border-accent-soft)] bg-[var(--sniptale-color-accent-soft)] ' +
  'text-[var(--sniptale-color-accent-emphasis)]';

const storageSummaryBannerClassName =
  'mt-5 grid gap-3 rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-panel)] px-4 py-4 md:grid-cols-[1fr_auto] md:items-center';

const storageEmptyStateClassName =
  'mt-5 rounded-[16px] border border-dashed border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_62%,transparent)] ' +
  'px-4 py-8 text-center text-sm text-[var(--sniptale-color-text-secondary)]';

const storageGroupCardClassName =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] p-4';

function getActionableGroups(report: StorageManagerModalProps['report']): StorageCleanupGroup[] {
  return (report?.groups ?? []).filter((group) => group.items.length > 0);
}

function StorageSummaryBanner({
  groupCount,
  potentialBytes,
}: {
  groupCount: number;
  potentialBytes: number;
}) {
  return (
    <div className={storageSummaryBannerClassName}>
      <div>
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('gallery.storageManager.readyTitle')}
        </div>
        <div className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.storageManager.readyDescription')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:min-w-[240px]">
        <div className={storageCounterClassName}>
          <div className="text-xl font-semibold text-[var(--sniptale-color-text-primary)]">
            {groupCount}
          </div>
          <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.storageManager.groupsCounter')}
          </div>
        </div>
        <div className={storageCounterClassName}>
          <div className="text-xl font-semibold text-[var(--sniptale-color-text-primary)]">
            {formatBytes(potentialBytes, 1)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.storageManager.spaceCounter')}
          </div>
        </div>
      </div>
    </div>
  );
}

function StorageCleanupItemList({ group }: { group: StorageCleanupGroup }) {
  return group.items.map((item) => (
    <div key={item.id} className={storageItemClassName}>
      <div className="truncate font-medium text-[var(--sniptale-color-text-primary)]">
        {item.filename}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-[var(--sniptale-color-text-muted)]">
        <span>{formatDate(item.createdAt)}</span>
        <span>{formatBytes(item.size)}</span>
      </div>
    </div>
  ));
}

function StorageCleanupGroupActions({
  group,
  onRun,
}: {
  group: StorageCleanupGroup;
  onRun: StorageManagerModalProps['onRun'];
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className={storageWarningClassName}>
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">
            {translate('gallery.storageManager.irreversibleTitle')}
          </span>{' '}
          {group.irreversibleLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void onRun(group)}
        className={storageDeleteButtonClassName}
      >
        <Trash2 className="h-4 w-4" />
        {translate('gallery.storageManager.deleteGroup')}
      </button>
    </div>
  );
}

function StorageCleanupGroupCard({
  group,
  onRun,
}: {
  group: StorageCleanupGroup;
  onRun: StorageManagerModalProps['onRun'];
}) {
  return (
    <section className={storageGroupCardClassName}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <div className="text-base font-semibold text-[var(--sniptale-color-text-primary)]">
            {group.title}
          </div>
          <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
            {group.description}
          </p>
        </div>
        <div className="rounded-[12px] border border-[var(--sniptale-color-border-soft)] px-3 py-2 text-right">
          <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
            {formatBytes(group.potentialBytes, 1)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.storageManager.groupSpaceLabel')}
          </div>
        </div>
      </div>
      <div className="mt-4 max-h-[220px] space-y-2 overflow-auto pr-1">
        <StorageCleanupItemList group={group} />
      </div>
      <StorageCleanupGroupActions group={group} onRun={onRun} />
    </section>
  );
}

export function StorageManagerModalContent({ report, onClose, onRun }: StorageManagerModalProps) {
  const groups = getActionableGroups(report);
  const potentialBytes = groups.reduce((total, group) => total + group.potentialBytes, 0);

  return (
    <GalleryModalFrame
      badgeIcon={HardDrive}
      badgeLabel={translate('gallery.storageManager.badge')}
      badgeClassName={storageBadgeClassName}
      title={translate('gallery.storageManager.title')}
      description={translate('gallery.storageManager.description')}
      maxWidthClassName="max-w-3xl"
      panelClassName="max-h-[calc(100vh-40px)] overflow-y-auto rounded-[16px]"
      titleClassName="text-2xl"
      onClose={onClose}
    >
      {groups.length === 0 ? (
        <div className={storageEmptyStateClassName}>
          {translate('gallery.storageManager.empty')}
        </div>
      ) : (
        <>
          <StorageSummaryBanner groupCount={groups.length} potentialBytes={potentialBytes} />
          <div className="mt-4 space-y-3">
            {groups.map((group) => (
              <StorageCleanupGroupCard key={group.id} group={group} onRun={onRun} />
            ))}
          </div>
        </>
      )}
    </GalleryModalFrame>
  );
}
