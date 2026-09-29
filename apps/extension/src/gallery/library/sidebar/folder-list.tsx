import { useLayoutEffect, useRef, useState, type Ref } from 'react';
import { translate } from '../../../platform/i18n';
import { FOLDER_LABELS, getGalleryFolderIcon } from '../ui';
import { SIDEBAR_FOLDERS } from '../constants';
import type { FolderFilter } from '../types';
import type { GallerySidebarProps } from './types';
import { GallerySavedViewRows } from './saved-views';
import { getRenderedGalleryFolders, isGalleryFolderAvailable } from './folder-visibility';

type FolderListProps = Pick<
  GallerySidebarProps,
  | 'activeSavedView'
  | 'counts'
  | 'countsKnown'
  | 'countsLoading'
  | 'folderFilter'
  | 'onDeleteSavedView'
  | 'onFolderFilterChange'
  | 'onMoveSavedView'
  | 'onSavedViewSelect'
  | 'savedViews'
  | 'savedViewsLoadFailed'
  | 'savedViewsLoaded'
>;

const activeFolderClassName = [
  'border-[var(--sniptale-color-border-accent-strong)]',
  'bg-[var(--sniptale-color-surface-hover)]',
  'text-[var(--sniptale-color-text-primary-strong)]',
].join(' ');
const inactiveFolderClassName = [
  'border-transparent text-[var(--sniptale-color-text-secondary)]',
  'hover:border-[var(--sniptale-color-border-soft)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

function GalleryFolderRow(
  props: FolderListProps & {
    buttonRef?: Ref<HTMLButtonElement>;
    folder: FolderFilter;
    onFocus: () => void;
  }
) {
  const Icon = getGalleryFolderIcon(props.folder);
  const active = props.folderFilter === props.folder && !props.activeSavedView;

  return (
    <div
      className="flex flex-col gap-1"
      data-gallery-folder={props.folder}
      onFocusCapture={props.onFocus}
    >
      <button
        ref={props.buttonRef}
        type="button"
        aria-pressed={active}
        onClick={() => props.onFolderFilterChange(props.folder)}
        className={[
          'flex h-9 w-full items-center justify-between rounded-[8px] border px-2.5 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
          'focus-visible:ring-[var(--sniptale-color-text-primary)]',
          active ? activeFolderClassName : inactiveFolderClassName,
        ].join(' ')}
      >
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">{FOLDER_LABELS[props.folder]}</span>
        </span>
        {props.countsKnown ? (
          <span
            className="rounded-full border border-[var(--sniptale-color-border-soft)]
              bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]
              px-2 py-0.5 text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
          >
            {props.counts[props.folder] ?? 0}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="h-4 w-5 animate-pulse rounded-full bg-[var(--sniptale-color-surface-hover)]
              motion-reduce:animate-none"
          />
        )}
      </button>
      {props.countsKnown && props.savedViewsLoaded ? (
        <GallerySavedViewRows
          activeSavedView={props.activeSavedView ?? null}
          folder={props.folder}
          savedViews={props.savedViews ?? []}
          {...(props.onDeleteSavedView ? { onDeleteSavedView: props.onDeleteSavedView } : {})}
          {...(props.onMoveSavedView ? { onMoveSavedView: props.onMoveSavedView } : {})}
          {...(props.onSavedViewSelect ? { onSavedViewSelect: props.onSavedViewSelect } : {})}
        />
      ) : null}
    </div>
  );
}

function GalleryFolderPlaceholders() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 pt-3"
      data-ui="gallery.sidebar.folderLoading"
    >
      <div className="h-3 w-16 rounded bg-[var(--sniptale-color-surface-hover)]" />
      <div className="h-9 rounded-[8px] bg-[var(--sniptale-color-surface-hover)]" />
      <div className="h-9 rounded-[8px] bg-[var(--sniptale-color-surface-hover)]" />
    </div>
  );
}

export function GalleryFolderList(props: FolderListProps) {
  const { counts, countsKnown, folderFilter, onFolderFilterChange } = props;
  const [focusedFolder, setFocusedFolder] = useState<FolderFilter | null>(null);
  const allButtonRef = useRef<HTMLButtonElement>(null);
  const folders = props.countsKnown
    ? getRenderedGalleryFolders({
        activeSavedView: Boolean(props.activeSavedView),
        counts: props.counts,
        focusedFolder,
        folderFilter: props.folderFilter,
      })
    : (['all'] as FolderFilter[]);
  const projects = folders.filter((folder) => folder === 'video-project' || folder === 'scenario');
  const materials = folders.filter(
    (folder) => folder !== 'all' && folder !== 'video-project' && folder !== 'scenario'
  );
  const hiddenSavedViewFolders =
    props.countsKnown && props.savedViewsLoaded
      ? SIDEBAR_FOLDERS.filter(
          (folder) =>
            !folders.includes(folder) &&
            props.savedViews?.some((view) => view.folderFilter === folder)
        )
      : [];

  useLayoutEffect(() => {
    if (!countsKnown) return;
    const focusedDisappeared =
      focusedFolder !== null && !isGalleryFolderAvailable(counts, focusedFolder);
    const activeDisappeared =
      !props.activeSavedView && !isGalleryFolderAvailable(counts, folderFilter);
    if (focusedDisappeared) allButtonRef.current?.focus();
    if (activeDisappeared) onFolderFilterChange('all');
  }, [
    counts,
    countsKnown,
    focusedFolder,
    folderFilter,
    onFolderFilterChange,
    props.activeSavedView,
  ]);

  const renderRow = (folder: FolderFilter) => (
    <GalleryFolderRow
      key={folder}
      {...props}
      {...(folder === 'all' ? { buttonRef: allButtonRef } : {})}
      folder={folder}
      onFocus={() => setFocusedFolder(folder)}
    />
  );

  return (
    <div
      aria-busy={props.countsLoading ?? false}
      className="flex shrink-0 flex-col gap-2"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedFolder(null);
      }}
    >
      {renderRow('all')}
      {props.countsKnown ? (
        <>
          {projects.length > 0 ? (
            <div className="px-2.5 pt-3 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.preview.projectsHeading')}
            </div>
          ) : null}
          {projects.map(renderRow)}
          {materials.length > 0 ? (
            <div className="px-2.5 pt-3 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.preview.materialsHeading')}
            </div>
          ) : null}
          {materials.map(renderRow)}
          {hiddenSavedViewFolders.length > 0 ? (
            <section data-ui="gallery.sidebar.hiddenSavedViews">
              <h3 className="px-2.5 pt-3 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.app.savedViewsHeading')}
              </h3>
              {hiddenSavedViewFolders.map((folder) => (
                <div key={folder} className="mt-2 space-y-1">
                  <p className="px-2.5 text-xs text-[var(--sniptale-color-text-muted)]">
                    {FOLDER_LABELS[folder]}
                  </p>
                  <GallerySavedViewRows
                    activeSavedView={props.activeSavedView ?? null}
                    folder={folder}
                    savedViews={props.savedViews ?? []}
                    {...(props.onDeleteSavedView
                      ? { onDeleteSavedView: props.onDeleteSavedView }
                      : {})}
                    {...(props.onMoveSavedView ? { onMoveSavedView: props.onMoveSavedView } : {})}
                    {...(props.onSavedViewSelect
                      ? { onSavedViewSelect: props.onSavedViewSelect }
                      : {})}
                  />
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <GalleryFolderPlaceholders />
      )}
      {props.savedViewsLoadFailed ? (
        <p className="px-2 py-1 text-xs text-[var(--sniptale-color-danger)]">
          {translate('gallery.app.savedViewLoadFailed')}
        </p>
      ) : null}
    </div>
  );
}
