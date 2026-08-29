import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AlignJustify,
  Download,
  Grid2X2,
  Globe2,
  HardDrive,
  Images,
  LayoutGrid,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import type { StorageEstimateInfo } from '../../../features/media-hub/storage-capacity';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS } from '@sniptale/ui/inspector-shell';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { GalleryViewMode } from '../types';
import type { GalleryMainContentProps } from './types';
import { GallerySelectionBar } from './selection-bar';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const galleryDangerBannerButtonClassName = [
  getControlSecondaryButtonClassName({ density: 'compact', shape: 'pill', tone: 'danger' }),
  'uppercase tracking-[0.12em]',
].join(' ');

const viewModeButtonClassName =
  'relative z-10 inline-flex h-full w-8 items-center justify-center rounded-[6px] leading-none transition-colors';

interface GalleryHeaderStorageProps {
  activeStorageBarClass: string;
  importTriggerRef: RefObject<HTMLButtonElement | null>;
  mediaImportTriggerRef: RefObject<HTMLButtonElement | null>;
  webSnapshotImportTriggerRef?: RefObject<HTMLButtonElement | null>;
  isBusy: boolean;
  onDeleteAll: () => void;
  onExportBackup: () => void;
  onImportBackupClick: () => void;
  onImportMediaClick: () => void;
  onImportWebSnapshotClick?: () => void;
  storageInfo: StorageEstimateInfo | null;
}

function GalleryStorageMenuAction(props: {
  buttonRef?: RefObject<HTMLButtonElement | null>;
  danger?: boolean;
  disabled: boolean;
  icon: typeof Download;
  label: string;
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <button
      ref={props.buttonRef}
      type="button"
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cx(
        'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm transition-colors',
        props.danger
          ? 'text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : [
              'text-[var(--sniptale-color-text-secondary)]',
              'hover:bg-[var(--sniptale-color-surface-canvas)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' '),
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{props.label}</span>
    </button>
  );
}

function getStoragePresentation(storageInfo: StorageEstimateInfo | null) {
  const hasQuota = Boolean(storageInfo && storageInfo.quota > 0);
  const unavailable = translate('gallery.app.storageUnavailable');
  const used = storageInfo ? formatBytes(storageInfo.usage) : unavailable;
  const available = hasQuota ? formatBytes(storageInfo?.remaining ?? 0) : unavailable;
  const usage = hasQuota ? `${used} / ${formatBytes(storageInfo?.quota ?? 0)}` : unavailable;
  const ratio = hasQuota ? Math.min(1, Math.max(0, storageInfo?.usageRatio ?? 0)) : 0;
  const title = hasQuota
    ? `${translate('gallery.app.storageUsed')}: ${used} · ${translate(
        'gallery.app.storageAvailable'
      )}: ${available}`
    : `${translate('gallery.app.storageTitle')}: ${unavailable}`;

  return { available, ratio, title, usage, used };
}

function useGalleryStorageMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const closeAndRun = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return { closeAndRun, isOpen, rootRef, setIsOpen };
}

function GalleryStorageSummary(props: ReturnType<typeof getStoragePresentation>) {
  return (
    <div className="grid grid-cols-2 gap-2 px-2.5 pb-2 pt-1">
      {[
        [translate('gallery.app.storageUsed'), props.used],
        [translate('gallery.app.storageAvailable'), props.available],
      ].map(([label, value]) => (
        <div key={label}>
          <div
            className={[
              'text-[10px] uppercase tracking-[0.1em]',
              'text-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
          >
            {label}
          </div>
          <div className="mt-0.5 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function GalleryStorageMenu(
  props: GalleryHeaderStorageProps & {
    closeAndRun: (action: () => void) => void;
    presentation: ReturnType<typeof getStoragePresentation>;
  }
) {
  return (
    <div
      role="menu"
      aria-label={translate('gallery.app.storageTools')}
      data-ui="gallery.header.storage-menu"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-[10px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        p-2 shadow-xl"
    >
      <GalleryStorageSummary {...props.presentation} />
      <div className="border-t border-[var(--sniptale-color-border-soft)] pt-1.5">
        <GalleryStorageMenuAction
          disabled={props.isBusy}
          icon={Download}
          label={translate('gallery.app.exportBackup')}
          onClick={() => props.closeAndRun(props.onExportBackup)}
        />
        <div
          className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em]
          text-[var(--sniptale-color-text-muted)]"
        >
          {translate('gallery.app.importSection')}
        </div>
        <GalleryStorageMenuAction
          buttonRef={props.mediaImportTriggerRef}
          disabled={props.isBusy}
          icon={Images}
          label={translate('gallery.app.importMediaFiles')}
          onClick={() => props.closeAndRun(props.onImportMediaClick)}
        />
        {props.onImportWebSnapshotClick ? (
          <GalleryStorageMenuAction
            {...(props.webSnapshotImportTriggerRef
              ? { buttonRef: props.webSnapshotImportTriggerRef }
              : {})}
            disabled={props.isBusy}
            icon={Globe2}
            label={translate('gallery.app.importWebSnapshot')}
            onClick={() => props.closeAndRun(() => props.onImportWebSnapshotClick?.())}
          />
        ) : null}
        <GalleryStorageMenuAction
          buttonRef={props.importTriggerRef}
          disabled={props.isBusy}
          icon={Upload}
          label={translate('gallery.app.importBackup')}
          onClick={() => props.closeAndRun(props.onImportBackupClick)}
        />
        <div
          role="separator"
          data-ui="gallery.header.storage-menu-danger-separator"
          className="mx-2.5 my-1.5 border-t border-[var(--sniptale-color-border-soft)]"
        />
        <GalleryStorageMenuAction
          danger
          disabled={props.isBusy}
          icon={Trash2}
          label={translate('gallery.app.deleteAll')}
          onClick={() => props.closeAndRun(props.onDeleteAll)}
        />
      </div>
      {props.isBusy ? (
        <div
          className="px-2.5 pb-1 pt-2 text-xs text-[var(--sniptale-color-text-secondary)]"
          aria-live="polite"
        >
          {translate('gallery.app.backupOperationRunning')}
        </div>
      ) : null}
    </div>
  );
}

function GalleryHeaderStorage(props: GalleryHeaderStorageProps) {
  const menu = useGalleryStorageMenu();
  const presentation = getStoragePresentation(props.storageInfo);
  const showProgress = presentation.ratio >= 0.25;

  return (
    <div ref={menu.rootRef} className="relative shrink-0" data-ui="gallery.header.storage">
      <button
        type="button"
        aria-expanded={menu.isOpen}
        aria-haspopup="menu"
        aria-label={translate('gallery.app.storageTools')}
        title={presentation.title}
        onClick={() => menu.setIsOpen((value) => !value)}
        className={[
          'flex h-8 w-40 items-center gap-2 rounded-[8px] border px-2 text-left transition-colors',
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
          'hover:border-[var(--sniptale-color-border-strong)]',
          'hover:bg-[var(--sniptale-color-surface-input)]',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--sniptale-color-border-accent-strong)]',
        ].join(' ')}
      >
        <HardDrive
          className="h-4 w-4 shrink-0 text-[var(--sniptale-color-accent-emphasis)]"
          aria-hidden="true"
        />
        <span
          data-ui="gallery.header.storage-usage"
          className={cx(
            'min-w-0 flex-1',
            showProgress ? 'block' : 'flex h-full items-center justify-center'
          )}
        >
          <span
            className={cx(
              'block truncate text-[10px] font-medium leading-3',
              'text-[var(--sniptale-color-text-secondary)]',
              !showProgress && 'text-center'
            )}
          >
            {presentation.usage}
          </span>
          {showProgress ? (
            <span
              data-ui="gallery.header.storage-progress"
              className="mt-1 block h-1 overflow-hidden rounded-full
                bg-[var(--sniptale-color-surface-canvas)]"
              aria-hidden="true"
            >
              <span
                className={cx('block h-full transition-[width]', props.activeStorageBarClass)}
                style={{ width: `${Math.round(presentation.ratio * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
        <Settings2 className="h-3.5 w-3.5 shrink-0 text-[var(--sniptale-color-text-muted)]" />
      </button>

      {menu.isOpen ? (
        <GalleryStorageMenu {...props} closeAndRun={menu.closeAndRun} presentation={presentation} />
      ) : null}
    </div>
  );
}

function GalleryHeaderSearchField(props: {
  folderFilter: GalleryMainContentProps['folderFilter'];
  search: string;
  onSearchChange: GalleryMainContentProps['onSearchChange'];
}) {
  return (
    <label
      className="flex min-w-0 items-center gap-2.5 border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_78%,transparent)]
        h-8 w-36 shrink-0 rounded-[8px] px-2.5
        transition-[width,border-color,background-color] duration-200 ease-out
        focus-within:w-48 focus-within:border-[var(--sniptale-color-border-accent-strong)]
        motion-reduce:transition-none"
      data-ui="gallery.header.search"
    >
      <Search className="h-4 w-4 shrink-0 text-[var(--sniptale-color-text-muted)]" />
      <input
        aria-label={translate('gallery.app.searchLabel')}
        value={props.search}
        onChange={(event) => props.onSearchChange(event.target.value)}
        placeholder={
          props.folderFilter === 'scenario'
            ? translate('gallery.app.scenarioSearchPlaceholder')
            : translate('gallery.app.searchPlaceholder')
        }
        className="w-full bg-transparent text-sm text-[var(--sniptale-color-text-primary)]
          outline-none placeholder:text-[var(--sniptale-color-text-muted)]
          focus:placeholder:text-transparent"
      />
    </label>
  );
}

function GalleryHeaderSortControl(
  props: Pick<GalleryMainContentProps, 'folderFilter' | 'onSortModeChange' | 'sortMode'>
) {
  return (
    <ProductSelect
      aria-label={translate('gallery.app.sortLabel')}
      value={props.sortMode}
      onChange={(value) => props.onSortModeChange(value as typeof props.sortMode)}
      controlSize="sm"
      containerClassName="w-[9.5rem] shrink-0"
      className="!h-8 !min-h-8 w-full"
      options={[
        { value: 'newest', label: translate('gallery.app.sortNewest') },
        { value: 'oldest', label: translate('gallery.app.sortOldest') },
        { value: 'name-asc', label: translate('gallery.app.sortNameAsc') },
        { value: 'name-desc', label: translate('gallery.app.sortNameDesc') },
        ...(props.folderFilter === 'scenario'
          ? []
          : [{ value: 'size-desc', label: translate('gallery.app.sortSizeDesc') }]),
      ]}
    />
  );
}

function GalleryViewModeButton(props: {
  active: boolean;
  icon: typeof AlignJustify;
  label: string;
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className={cx(
        viewModeButtonClassName,
        props.active
          ? 'text-[var(--sniptale-color-accent-emphasis)]'
          : [
              'text-[var(--sniptale-color-text-secondary)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')
      )}
      data-ui={`gallery.header.view-mode.${props.label}`}
    >
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <Icon className="block h-[15px] w-[15px]" />
      </span>
    </button>
  );
}

function GalleryViewModeToggle(props: {
  onViewModeChange: GalleryMainContentProps['onViewModeChange'];
  viewMode: GalleryViewMode;
}) {
  const activeIndex = ['list', 'compact-grid', 'large-grid'].indexOf(props.viewMode);

  return (
    <div
      aria-label={translate('gallery.app.viewModeLabel')}
      role="group"
      className={[
        'relative grid h-8 w-[6.5rem] shrink-0 grid-cols-3 items-center',
        'overflow-hidden rounded-[8px] border p-0.5',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-[6px]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,var(--sniptale-color-accent)_10%)]
          shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]
          transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          left: '0.125rem',
          width: 'calc((100% - 0.25rem) / 3)',
          transform: `translateX(${Math.max(0, activeIndex) * 100}%)`,
        }}
      />
      <GalleryViewModeButton
        active={props.viewMode === 'list'}
        icon={AlignJustify}
        label={translate('gallery.app.viewModeList')}
        onClick={() => props.onViewModeChange('list')}
      />
      <GalleryViewModeButton
        active={props.viewMode === 'compact-grid'}
        icon={Grid2X2}
        label={translate('gallery.app.viewModeCompactGrid')}
        onClick={() => props.onViewModeChange('compact-grid')}
      />
      <GalleryViewModeButton
        active={props.viewMode === 'large-grid'}
        icon={LayoutGrid}
        label={translate('gallery.app.viewModeLargeGrid')}
        onClick={() => props.onViewModeChange('large-grid')}
      />
    </div>
  );
}

function GalleryHeaderControls(
  props: Pick<
    GalleryMainContentProps,
    | 'folderFilter'
    | 'onSearchChange'
    | 'onSortModeChange'
    | 'onViewModeChange'
    | 'search'
    | 'sortMode'
    | 'viewMode'
  > &
    GalleryHeaderStorageProps & { stackWhenNarrow: boolean }
) {
  return (
    <div
      className={cx(
        'ml-auto flex min-w-max shrink-0 flex-nowrap items-center justify-end gap-2',
        props.stackWhenNarrow &&
          'max-2xl:row-start-1 max-2xl:ml-0 max-2xl:justify-self-start max-2xl:justify-start'
      )}
      data-ui="gallery.header.controls"
    >
      <GalleryHeaderSearchField
        folderFilter={props.folderFilter}
        search={props.search}
        onSearchChange={props.onSearchChange}
      />
      <GalleryHeaderSortControl
        folderFilter={props.folderFilter}
        sortMode={props.sortMode}
        onSortModeChange={props.onSortModeChange}
      />
      <GalleryViewModeToggle viewMode={props.viewMode} onViewModeChange={props.onViewModeChange} />
      <GalleryHeaderStorage {...props} />
    </div>
  );
}

export function GalleryHeaderBanner(
  props: Pick<GalleryMainContentProps, 'banner' | 'onBannerDismiss'>
) {
  const { banner, onBannerDismiss } = props;
  if (!banner) {
    return null;
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px]
        border border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_66%,var(--sniptale-color-surface-panel)_34%)]
        px-4 py-3 text-sm
        text-[color:color-mix(in_srgb,var(--sniptale-color-danger)_76%,var(--sniptale-color-text-primary)_24%)]"
    >
      <ShieldAlert className="h-4 w-4" />
      <span className="flex-1">{banner}</span>
      <button
        type="button"
        onClick={onBannerDismiss}
        className={galleryDangerBannerButtonClassName}
      >
        {translate('common.actions.close')}
      </button>
    </div>
  );
}

export function GalleryHeader(
  props: Pick<
    GalleryMainContentProps,
    | 'allTags'
    | 'folderFilter'
    | 'onApplySelectionTag'
    | 'onClearSelection'
    | 'onDeleteMany'
    | 'onSearchChange'
    | 'onSelectionTagDraftChange'
    | 'onSelectionBackup'
    | 'onSelectionZip'
    | 'onSortModeChange'
    | 'onViewModeChange'
    | 'search'
    | 'selectedItems'
    | 'selectedSize'
    | 'selectionTagDraft'
    | 'sortMode'
    | 'viewMode'
  > &
    GalleryHeaderStorageProps
) {
  const hasSelection = props.selectedItems.length > 0;

  return (
    <header
      className={cx(
        'relative z-30 flex h-12 min-h-12 shrink-0 items-center gap-4',
        'rounded-[var(--sniptale-radius-lg)] border py-1.5',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] shadow-sm',
        hasSelection && 'max-2xl:h-[5.25rem] max-2xl:min-h-[5.25rem]'
      )}
    >
      <div
        className={cx(
          INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
          'flex min-w-0 shrink-0 items-center px-3'
        )}
        data-ui="gallery.header.segment"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-[var(--sniptale-color-accent-emphasis)]">
            <Images className="h-[22px] w-[22px]" aria-hidden="true" />
          </span>
          <h1 className="truncate text-base font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('gallery.app.title')}
          </h1>
        </div>
      </div>
      <div
        className={cx(
          'flex min-w-0 flex-1 flex-nowrap items-center gap-2 pr-3',
          hasSelection &&
            'max-2xl:grid max-2xl:h-full max-2xl:grid-cols-1 max-2xl:grid-rows-[2rem_2rem] max-2xl:gap-y-2'
        )}
        data-ui="gallery.header.workspace"
      >
        <div
          className={cx(
            'min-w-0 flex-1',
            hasSelection && 'overflow-visible max-2xl:row-start-2 max-2xl:w-full'
          )}
        >
          <GallerySelectionBar {...props} />
        </div>
        <GalleryHeaderControls {...props} stackWhenNarrow={hasSelection} />
      </div>
    </header>
  );
}
