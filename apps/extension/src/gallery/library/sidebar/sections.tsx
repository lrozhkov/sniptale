import { Download, FolderArchive, HardDrive, Upload } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { SIDEBAR_FOLDERS } from '../constants';
import { FOLDER_LABELS, getGalleryFolderIcon } from '../ui';
import { cx } from './helpers';
import type { GallerySidebarProps } from './types';

export function GalleryFolderList({
  counts,
  folderFilter,
  onFolderFilterChange,
}: Pick<GallerySidebarProps, 'counts' | 'folderFilter' | 'onFolderFilterChange'>) {
  return (
    <div className="mt-8 space-y-2">
      {SIDEBAR_FOLDERS.map((folder) => {
        const Icon = getGalleryFolderIcon(folder);
        const active = folderFilter === folder;

        return (
          <button
            key={folder}
            type="button"
            onClick={() => onFolderFilterChange(folder)}
            className={cx(
              'flex w-full items-center justify-between rounded-[14px] border px-3 py-3 text-left transition',
              active
                ? 'border-[var(--sniptale-color-border-strong)]' +
                    ' bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]' +
                    ' text-[var(--sniptale-color-text-primary)]' +
                    ' shadow-sm'
                : 'border-transparent text-[var(--sniptale-color-text-secondary)]' +
                    ' hover:border-[var(--sniptale-color-border-soft)]' +
                    ' hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent)]' +
                    ' hover:text-[var(--sniptale-color-text-primary)]'
            )}
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-medium">
              <Icon className="h-4 w-4" />
              {FOLDER_LABELS[folder]}
            </span>
            <span
              className="rounded-full border border-[var(--sniptale-color-border-soft)]
                bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]
                px-2.5 py-1 text-xs font-semibold text-[var(--sniptale-color-text-secondary)]"
            >
              {counts[folder] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GalleryStorageCard({
  activeStorageBarClass,
  onStorageManagerOpen,
  storageInfo,
}: Pick<GallerySidebarProps, 'activeStorageBarClass' | 'onStorageManagerOpen' | 'storageInfo'>) {
  const storageUsageLabel = storageInfo?.quota
    ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}`
    : translate('gallery.app.storageUnavailable');
  const storagePersistentLabel =
    storageInfo?.isPersistent === true
      ? translate('gallery.app.storagePersistentEnabled')
      : storageInfo?.isPersistent === false
        ? translate('gallery.app.storagePersistentPending')
        : translate('gallery.app.storagePersistentUnavailable');

  return (
    <div
      className="mt-6 rounded-[16px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
        p-4 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        <HardDrive className="h-4 w-4 text-[var(--sniptale-color-accent-emphasis)]" />
        {translate('gallery.app.storageTitle')}
      </div>
      <div className="text-sm text-[var(--sniptale-color-text-secondary)]">{storageUsageLabel}</div>
      <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.app.storagePersistentPrefix')} {storagePersistentLabel}
      </div>
      <GalleryStorageUsageBar
        activeStorageBarClass={activeStorageBarClass}
        {...(storageInfo?.usageRatio === undefined ? {} : { usageRatio: storageInfo.usageRatio })}
      />
      <button
        type="button"
        onClick={onStorageManagerOpen}
        className="mt-4 w-full rounded-[16px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-3 py-2.5 text-sm font-medium
          text-[var(--sniptale-color-text-primary)] transition
          hover:border-[var(--sniptale-color-border-strong)]
          hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]"
      >
        {translate('gallery.app.openStorageManager')}
      </button>
    </div>
  );
}

function GalleryStorageUsageBar(props: { activeStorageBarClass: string; usageRatio?: number }) {
  return (
    <div
      className="mt-3 h-2 overflow-hidden rounded-full
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]"
    >
      <div
        className={cx('h-full transition-all', props.activeStorageBarClass)}
        style={{
          width: `${Math.max(4, Math.round((props.usageRatio ?? 0) * 100))}%`,
        }}
      />
    </div>
  );
}

function GalleryTagButton(props: { active: boolean; onClick: () => void; tag: string }) {
  return (
    <button
      key={props.tag}
      type="button"
      onClick={props.onClick}
      className={cx(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition',
        props.active
          ? 'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_34%,var(--sniptale-color-border-soft)_66%)]' +
              ' bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]' +
              ' text-[var(--sniptale-color-info)]'
          : 'border-[var(--sniptale-color-border-soft)]' +
              ' bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]' +
              ' text-[var(--sniptale-color-text-secondary)]' +
              ' hover:border-[var(--sniptale-color-border-strong)]' +
              ' hover:bg-[var(--sniptale-color-surface-panel)]'
      )}
    >
      #{props.tag}
    </button>
  );
}

export function GalleryTagsCard({
  activeTags,
  allTags,
  onActiveTagsChange,
}: Pick<GallerySidebarProps, 'activeTags' | 'allTags' | 'onActiveTagsChange'>) {
  return (
    <div
      className="mt-6 rounded-[16px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
        p-4 shadow-sm"
    >
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]
          text-[var(--sniptale-color-text-muted-strong)]"
      >
        {translate('gallery.app.tagsTitle')}
      </div>
      <div className="flex flex-wrap gap-2">
        {allTags.length > 0 ? (
          allTags.map((tag) => {
            const active = activeTags.includes(tag);

            return (
              <GalleryTagButton
                key={tag}
                active={active}
                onClick={() =>
                  onActiveTagsChange((previous) =>
                    previous.includes(tag)
                      ? previous.filter((value) => value !== tag)
                      : [...previous, tag]
                  )
                }
                tag={tag}
              />
            );
          })
        ) : (
          <div className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.app.tagsEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

export function GalleryBackupActions({
  isBusy,
  onExportBackup,
  onImportBackupClick,
}: Pick<GallerySidebarProps, 'isBusy' | 'onExportBackup' | 'onImportBackupClick'>) {
  return (
    <div className="mt-auto pt-6 space-y-2">
      <button
        type="button"
        onClick={onExportBackup}
        disabled={isBusy}
        className="flex w-full items-center justify-between rounded-[14px]
          border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
          px-4 py-3 text-sm font-medium text-[var(--sniptale-color-text-primary)] transition
          hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-panel)]
          disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2">
          <FolderArchive className="h-4 w-4 text-[var(--sniptale-color-accent-emphasis)]" />
          {translate('gallery.app.exportBackup')}
        </span>
        <Download className="h-4 w-4 text-[var(--sniptale-color-text-muted)]" />
      </button>
      <button
        type="button"
        onClick={onImportBackupClick}
        disabled={isBusy}
        className="flex w-full items-center justify-between rounded-[14px]
          border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
          px-4 py-3 text-sm font-medium text-[var(--sniptale-color-text-primary)] transition
          hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-panel)]
          disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2">
          <Upload className="h-4 w-4 text-[var(--sniptale-color-info)]" />
          {translate('gallery.app.importBackup')}
        </span>
        <Upload className="h-4 w-4 text-[var(--sniptale-color-text-muted)]" />
      </button>
    </div>
  );
}
