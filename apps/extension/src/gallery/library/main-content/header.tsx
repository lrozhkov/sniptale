import { AlignJustify, Grid2X2, LayoutGrid, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  InspectorShellHeaderSegment,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
  INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
} from '@sniptale/ui/inspector-shell';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { GalleryViewMode } from '../types';
import type { GalleryMainContentProps } from './types';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const galleryDangerBannerButtonClassName = [
  getControlSecondaryButtonClassName({ density: 'compact', shape: 'pill', tone: 'danger' }),
  'uppercase tracking-[0.12em]',
].join(' ');

const viewModeButtonClassName =
  'inline-flex h-9 w-9 items-center justify-center rounded-[12px] border transition';

function GalleryHeaderSearchField(props: {
  folderFilter: GalleryMainContentProps['folderFilter'];
  search: string;
  onSearchChange: GalleryMainContentProps['onSearchChange'];
}) {
  return (
    <label
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
        px-3 py-2"
    >
      <Search className="h-4 w-4 text-[var(--sniptale-color-text-muted)]" />
      <input
        value={props.search}
        onChange={(event) => props.onSearchChange(event.target.value)}
        placeholder={
          props.folderFilter === 'scenario'
            ? translate('gallery.app.scenarioSearchPlaceholder')
            : translate('gallery.app.searchPlaceholder')
        }
        className="w-full bg-transparent text-sm text-[var(--sniptale-color-text-primary)]
          outline-none placeholder:text-[var(--sniptale-color-text-muted)]"
      />
    </label>
  );
}

function GalleryHeaderSortControl(
  props: Pick<GalleryMainContentProps, 'folderFilter' | 'onSortModeChange' | 'sortMode'>
) {
  return (
    <div className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span className="text-xs font-semibold text-[var(--sniptale-color-text-muted-strong)]">
        {translate('gallery.app.sortLabel')}:
      </span>
      <ProductSelect
        value={props.sortMode}
        onChange={(value) => props.onSortModeChange(value as typeof props.sortMode)}
        className="min-w-[156px]"
        options={[
          { value: 'newest', label: translate('gallery.app.sortNewest') },
          { value: 'oldest', label: translate('gallery.app.sortOldest') },
          {
            value: 'size',
            label:
              props.folderFilter === 'scenario'
                ? translate('gallery.app.sortName')
                : translate('gallery.app.sortSize'),
          },
        ]}
      />
    </div>
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
          ? [
              'border-[var(--sniptale-color-border-accent-strong)]',
              'bg-[var(--sniptale-color-accent-soft)]',
              'text-[var(--sniptale-color-accent-emphasis)]',
            ].join(' ')
          : [
              'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
              'text-[var(--sniptale-color-text-secondary)]',
              'hover:border-[var(--sniptale-color-border-strong)]',
              'hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')
      )}
      data-ui={`gallery.header.view-mode.${props.label}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function GalleryViewModeToggle(props: {
  onViewModeChange: GalleryMainContentProps['onViewModeChange'];
  viewMode: GalleryViewMode;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1 rounded-[14px]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)] p-1"
    >
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

function GalleryRefreshButton(props: { isLoading: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onRefresh}
      className={getControlSecondaryButtonClassName({ density: 'compact' })}
    >
      <RefreshCw className={cx('h-4 w-4', props.isLoading && 'animate-spin')} />
      {translate('gallery.app.refresh')}
    </button>
  );
}

function GalleryHeaderControls(
  props: Pick<
    GalleryMainContentProps,
    | 'folderFilter'
    | 'isLoading'
    | 'onRefresh'
    | 'onSearchChange'
    | 'onSortModeChange'
    | 'onViewModeChange'
    | 'search'
    | 'sortMode'
    | 'viewMode'
  >
) {
  return (
    <div className="flex flex-nowrap items-center gap-2.5">
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
      <GalleryRefreshButton isLoading={props.isLoading} onRefresh={props.onRefresh} />
    </div>
  );
}

export function GalleryHeaderBanner(
  props: Pick<GalleryMainContentProps, 'banner' | 'onBannerDismiss' | 'onStorageManagerOpen'>
) {
  const { banner, onBannerDismiss, onStorageManagerOpen } = props;
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
        onClick={onStorageManagerOpen}
        className={galleryDangerBannerButtonClassName}
      >
        {translate('gallery.app.storageManager')}
      </button>
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
    | 'folderFilter'
    | 'isLoading'
    | 'onRefresh'
    | 'onSearchChange'
    | 'onSortModeChange'
    | 'onViewModeChange'
    | 'search'
    | 'sortMode'
    | 'viewMode'
  >
) {
  return (
    <header
      className={[
        'flex shrink-0 items-center border-b border-[var(--sniptale-color-border-soft)]',
        INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
      ].join(' ')}
    >
      <InspectorShellHeaderSegment
        expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
        className="px-4"
        dataUi="gallery.header.segment"
      >
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('gallery.app.title')}
          </h1>
          <p className="truncate text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.app.description')}
          </p>
        </div>
      </InspectorShellHeaderSegment>
      <div className="flex min-w-0 flex-1 items-center px-5">
        <GalleryHeaderControls {...props} />
      </div>
    </header>
  );
}
