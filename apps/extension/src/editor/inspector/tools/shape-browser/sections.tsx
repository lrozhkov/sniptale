import { Upload } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { cx } from '../../../chrome/ui';
import { getShapeBrowserCategoryLabel } from './data';
import { ShapeTile, ShapeTileGrid } from './tile';
import type {
  ShapeBrowserCategory,
  ShapeBrowserCategoryGroup,
  ShapeBrowserEntry,
  ShapeBrowserImportState,
  ShapeBrowserSourceFilter,
} from './types';

const COLLAPSED_CATEGORY_LIMIT = 20;

export function ImportShapeControl(props: { onImportFile?: (file: File) => void }) {
  const inputId = 'shape-browser-custom-import';
  const disabled = !props.onImportFile;
  return (
    <div className="flex items-center justify-between gap-2">
      <label
        htmlFor={inputId}
        className={cx(
          'inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[8px] border px-2',
          'border-[color:var(--sniptale-color-border-soft)]',
          'bg-[color:var(--sniptale-color-surface-input)] text-xs font-semibold',
          'text-[color:var(--sniptale-color-text-secondary)]',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <Upload size={13} strokeWidth={2} />
        <span>{translate('editor.shapeCatalog.browser.importCustomShape')}</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".svg,.json,.excalidrawlib,image/svg+xml,application/json"
        className="hidden"
        disabled={disabled}
        aria-label={translate('editor.shapeCatalog.browser.importCustomShape')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            props.onImportFile?.(file);
          }
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}

export function PrimaryShortcutRow(props: {
  entries: readonly ShapeBrowserEntry[];
  selectedEntryId?: string | null;
  onSelect: (entry: ShapeBrowserEntry) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-bold uppercase leading-4 text-[color:var(--sniptale-color-text-secondary)]">
        {translate('editor.shapeCatalog.browser.primaryShortcuts')}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {props.entries.map((entry) => (
          <ShapeTile
            key={entry.id}
            entry={entry}
            primary
            selected={props.selectedEntryId === entry.id}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryHeader(props: { category: ShapeBrowserCategory; count: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <h4
        className={[
          'min-w-0 truncate text-[12px] font-bold uppercase leading-4',
          'text-[color:var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {getShapeBrowserCategoryLabel(props.category)}
      </h4>
      <span className="shrink-0 text-[12px] font-semibold leading-4 text-[color:var(--sniptale-color-text-muted)]">
        {props.count}
      </span>
    </div>
  );
}

function CategoryExpansionButton(props: {
  category: ShapeBrowserCategory;
  expanded: boolean;
  onToggleExpanded: (category: ShapeBrowserCategory) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onToggleExpanded(props.category)}
      className="text-xs font-semibold text-[color:var(--sniptale-color-accent)]"
    >
      {translate(
        props.expanded
          ? 'editor.shapeCatalog.browser.showLess'
          : 'editor.shapeCatalog.browser.showMore'
      )}
    </button>
  );
}

export function CategorySection(props: {
  group: ShapeBrowserCategoryGroup;
  expanded: boolean;
  selectedEntryId?: string | null;
  onDelete?: (entry: ShapeBrowserEntry) => void;
  onDisable?: (entry: ShapeBrowserEntry) => void;
  onToggleExpanded: (category: ShapeBrowserCategory) => void;
  onSelect: (entry: ShapeBrowserEntry) => void;
}) {
  const visibleEntries = props.expanded
    ? props.group.entries
    : props.group.entries.slice(0, COLLAPSED_CATEGORY_LIMIT);
  const canExpand = props.group.entries.length > COLLAPSED_CATEGORY_LIMIT;

  return (
    <section className="space-y-2" data-shape-category={props.group.category}>
      <CategoryHeader category={props.group.category} count={props.group.entries.length} />
      <ShapeTileGrid
        entries={visibleEntries}
        onSelect={props.onSelect}
        {...(props.selectedEntryId === undefined ? {} : { selectedEntryId: props.selectedEntryId })}
        {...(props.onDelete ? { onDelete: props.onDelete } : {})}
        {...(props.onDisable ? { onDisable: props.onDisable } : {})}
      />
      {canExpand ? (
        <CategoryExpansionButton
          category={props.group.category}
          expanded={props.expanded}
          onToggleExpanded={props.onToggleExpanded}
        />
      ) : null}
    </section>
  );
}

export function ShapeBrowserEmptyState(props: {
  importState?: ShapeBrowserImportState;
  sourceFilter: ShapeBrowserSourceFilter;
}) {
  const customOnly = props.sourceFilter === 'custom';
  const importOnly = props.sourceFilter === 'imported-library' || customOnly;
  const importError = importOnly && props.importState?.status === 'error';
  const importEmpty = importOnly && props.importState?.status === 'empty';
  const title = importError
    ? translate(
        customOnly
          ? 'editor.shapeCatalog.browser.customErrorTitle'
          : 'editor.shapeCatalog.browser.importErrorTitle'
      )
    : importEmpty
      ? translate(
          customOnly
            ? 'editor.shapeCatalog.browser.customEmptyTitle'
            : 'editor.shapeCatalog.browser.importEmptyTitle'
        )
      : translate('editor.shapeCatalog.browser.emptyTitle');
  const description = importError
    ? props.importState?.message
    : translate('editor.shapeCatalog.browser.emptyDescription');

  return (
    <div
      role={importError ? 'alert' : 'status'}
      className="rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] p-3"
    >
      <div className="text-sm font-semibold text-[color:var(--sniptale-color-text-primary)]">
        {title}
      </div>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-[color:var(--sniptale-color-text-secondary)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
