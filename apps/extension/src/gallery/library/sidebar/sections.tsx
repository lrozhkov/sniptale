import { useState } from 'react';
import { Check, ChevronDown, RotateCcw, Search, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { SIDEBAR_FOLDERS } from '../constants';
import { FOLDER_LABELS, getGalleryFolderIcon } from '../ui';
import type { GallerySidebarProps } from './types';

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

const facetOptionRowClassName = [
  'flex h-8 cursor-pointer items-center gap-2 rounded-[7px] px-1.5',
  'hover:bg-[var(--sniptale-color-surface-canvas)]',
].join(' ');

const facetSummaryClassName = [
  'flex h-10 cursor-pointer list-none items-center gap-2 rounded-[8px] px-1.5 outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]',
].join(' ');

const facetSearchClassName = [
  'mb-1.5 flex h-7 items-center gap-1.5 rounded-[7px] border px-2',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
].join(' ');

const facetSearchInputClassName = [
  'min-w-0 flex-1 bg-transparent text-xs outline-none',
  'placeholder:text-[var(--sniptale-color-text-muted)]',
].join(' ');

export function GalleryFolderList({
  counts,
  folderFilter,
  onFolderFilterChange,
}: Pick<GallerySidebarProps, 'counts' | 'folderFilter' | 'onFolderFilterChange'>) {
  return (
    <div className="space-y-2">
      {SIDEBAR_FOLDERS.map((folder) => {
        const Icon = getGalleryFolderIcon(folder);
        const active = folderFilter === folder;

        return (
          <button
            key={folder}
            type="button"
            onClick={() => onFolderFilterChange(folder)}
            className={cx(
              'flex h-9 w-full items-center justify-between rounded-[8px] border px-2.5 text-left transition',
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
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
              <Icon className="h-4 w-4" />
              <span className="truncate">{FOLDER_LABELS[folder]}</span>
            </span>
            <span
              className="rounded-full border border-[var(--sniptale-color-border-soft)]
                bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]
                px-2 py-0.5 text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
            >
              {counts[folder] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function getFacetTitle(id: GallerySidebarProps['facets'][number]['id']): string {
  const titles = {
    created: translate('gallery.app.facetTitle.created'),
    status: translate('gallery.app.facetTitle.status'),
    tags: translate('gallery.app.facetTitle.tags'),
    format: translate('gallery.app.facetTitle.format'),
    size: translate('gallery.app.facetTitle.size'),
    resolution: translate('gallery.app.facetTitle.resolution'),
    duration: translate('gallery.app.facetTitle.duration'),
    source: translate('gallery.app.facetTitle.source'),
    updated: translate('gallery.app.facetTitle.updated'),
  };
  return titles[id];
}

function getStatusValues(scope: GallerySidebarProps['scope']): string[] {
  if (scope === 'library') return ['library'];
  if (scope === 'temporary') return ['temporary'];
  return ['library', 'temporary'];
}

function toggleStatusValue(scope: GallerySidebarProps['scope'], value: string) {
  const selected = getStatusValues(scope);
  const next = selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];
  if (next.length !== 1) return 'all' as const;
  return next[0] === 'library' ? ('library' as const) : ('temporary' as const);
}

function GalleryFacetOptionRow(props: {
  checked: boolean;
  count: number;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={facetOptionRowClassName}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={props.onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          props.checked
            ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent)] text-white'
            : 'border-[var(--sniptale-color-border-strong)] bg-[var(--sniptale-color-surface-input)]'
        )}
      >
        {props.checked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--sniptale-color-text-secondary)]">
        {props.label}
      </span>
      <span className="text-[11px] tabular-nums text-[var(--sniptale-color-text-muted)]">
        {props.count}
      </span>
    </label>
  );
}

function GalleryFacetSection(props: {
  facet: GallerySidebarProps['facets'][number];
  onClear?: () => void;
  onToggle: (value: string) => void;
  selected: string[];
}) {
  const [isOpen, setIsOpen] = useState(props.facet.id === 'status' || props.facet.id === 'tags');
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const options = props.facet.options.filter((option) =>
    option.label.toLowerCase().includes(normalizedSearch)
  );
  const singleSelectedLabel =
    props.selected.length === 1
      ? props.facet.options.find((option) => option.value === props.selected[0])?.label
      : undefined;
  const selectionSummary =
    singleSelectedLabel ?? `${translate('gallery.app.facetSelected')} ${props.selected.length}`;

  return (
    <details
      className="group border-b border-[var(--sniptale-color-border-soft)] last:border-b-0"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className={facetSummaryClassName}>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
          {getFacetTitle(props.facet.id)}
        </span>
        {props.selected.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <span
              title={singleSelectedLabel}
              className={cx(
                'text-[10px] font-medium text-[var(--sniptale-color-accent-emphasis)]',
                singleSelectedLabel && 'max-w-28 truncate'
              )}
            >
              {selectionSummary}
            </span>
            {props.onClear ? (
              <button
                type="button"
                aria-label={`${translate('gallery.app.facetClear')} ${getFacetTitle(props.facet.id)}`}
                title={translate('gallery.app.facetClear')}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onClear?.();
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-[5px]
                  text-[var(--sniptale-color-text-muted)] transition-colors
                  hover:bg-[var(--sniptale-color-surface-canvas)]
                  hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ) : null}
        <ChevronDown
          className="h-3.5 w-3.5 text-[var(--sniptale-color-text-muted)]
            transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-2">
        {props.facet.searchable ? (
          <div className={facetSearchClassName}>
            <Search className="h-3.5 w-3.5 text-[var(--sniptale-color-text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`${translate('gallery.app.facetSearch')} ${getFacetTitle(props.facet.id)}`}
              placeholder={translate('gallery.app.facetSearch')}
              className={facetSearchInputClassName}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={translate('gallery.app.facetClearSearch')}
                title={translate('gallery.app.facetClearSearch')}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]
                  text-[var(--sniptale-color-text-muted)] transition-colors
                  hover:bg-[var(--sniptale-color-surface-canvas)]
                  hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={cx(props.facet.searchable && 'max-h-56 overflow-y-auto', 'pr-0.5')}>
          {options.length > 0 ? (
            options.map((option) => (
              <GalleryFacetOptionRow
                key={option.value}
                checked={props.selected.includes(option.value)}
                count={option.count}
                label={option.label}
                onChange={() => props.onToggle(option.value)}
              />
            ))
          ) : (
            <div className="px-1.5 py-2 text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.app.facetNoMatches')}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export function GalleryFacetFilters(props: GallerySidebarProps) {
  const visibleFacets = props.facets.filter(
    (facet) => facet.options.length > 0 || facet.id === 'status' || facet.id === 'tags'
  );

  const getSelected = (facet: GallerySidebarProps['facets'][number]) => {
    if (facet.id === 'status') return getStatusValues(props.scope);
    if (facet.id === 'tags') return props.activeTags;
    return props.facetFilters[facet.id];
  };

  const toggle = (facet: GallerySidebarProps['facets'][number], value: string) => {
    if (facet.id === 'status') {
      props.onScopeChange(toggleStatusValue(props.scope, value));
      return;
    }
    const selected = getSelected(facet);
    const next = selected.includes(value)
      ? selected.filter((candidate) => candidate !== value)
      : [...selected, value];
    if (facet.id === 'tags') {
      props.onActiveTagsChange(next);
      return;
    }
    props.onFacetFilterChange(facet.id, next);
  };

  const clear = (facet: GallerySidebarProps['facets'][number]) => {
    if (facet.id === 'tags') {
      props.onActiveTagsChange([]);
      return;
    }
    if (facet.id !== 'status') {
      props.onFacetFilterChange(facet.id, []);
    }
  };

  const hasActiveFilters =
    props.scope !== 'all' ||
    props.activeTags.length > 0 ||
    Object.values(props.facetFilters).some((values) => values.length > 0);

  return (
    <div className="mt-3 border-t border-[var(--sniptale-color-border-soft)] pt-1">
      {visibleFacets.map((facet) => (
        <GalleryFacetSection
          key={facet.id}
          facet={facet}
          selected={getSelected(facet)}
          {...(facet.id !== 'status' && getSelected(facet).length > 0
            ? { onClear: () => clear(facet) }
            : {})}
          onToggle={(value) => toggle(facet, value)}
        />
      ))}
      {hasActiveFilters ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={props.onResetFilters}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-[8px] border
              border-[var(--sniptale-color-border-soft)] px-2.5 text-xs font-medium
              text-[var(--sniptale-color-text-secondary)] transition-colors
              hover:border-[var(--sniptale-color-border-strong)]
              hover:bg-[var(--sniptale-color-surface-canvas)]
              hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {translate('gallery.app.facetResetAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
