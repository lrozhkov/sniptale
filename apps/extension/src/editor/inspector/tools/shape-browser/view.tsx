import React from 'react';
import { translate } from '../../../../platform/i18n';
import { SearchField } from '../../../chrome/ui';
import { PanelSection } from '../sections';
import { createBuiltInShapeBrowserEntries, getPrimaryShapeBrowserEntries } from './data';
import { ImportDiagnostics } from './diagnostics';
import { filterShapeBrowserEntries, groupShapeBrowserEntries } from './filtering';
import { handleBrowserKeyDown } from './keyboard';
import {
  CategorySection,
  ImportShapeControl,
  PrimaryShortcutRow,
  ShapeBrowserEmptyState,
} from './sections';
import { SourceFilters } from './source-filters';
import type {
  ShapeBrowserCategory,
  ShapeBrowserEntry,
  ShapeBrowserImportState,
  ShapeBrowserSourceFilter,
  ShapeBrowserViewState,
} from './types';

export interface ShapeBrowserProps {
  additionalEntries?: readonly ShapeBrowserEntry[];
  defaultSourceFilter?: ShapeBrowserSourceFilter;
  excludedCategories?: readonly ShapeBrowserCategory[];
  importState?: ShapeBrowserImportState;
  selectedEntryId?: string | null;
  showImport?: boolean;
  showPrimaryShortcuts?: boolean;
  showSourceFilters?: boolean;
  sourceFilters?: readonly ShapeBrowserSourceFilter[];
  title?: string;
  onDeleteCustomShape?: (entry: ShapeBrowserEntry) => void;
  onDisableCustomShape?: (entry: ShapeBrowserEntry) => void;
  onImportFile?: (file: File) => void;
  onSelect: (entry: ShapeBrowserEntry) => void;
}

function createInitialState(defaultSourceFilter: ShapeBrowserSourceFilter): ShapeBrowserViewState {
  return {
    expandedCategories: new Set(),
    query: '',
    selectedEntryId: null,
    sourceFilter: defaultSourceFilter,
  };
}

export function resetShapeBrowserSessionStateForTests(): void {
  // Kept as a compatibility helper for existing focused tests. Shape browser state is now
  // instance-local so switching between editor tool branches cannot leak filters or search.
}

function ShapeBrowserControls(props: {
  importState?: ShapeBrowserImportState;
  query: string;
  showSourceFilters?: boolean;
  sourceFilter: ShapeBrowserSourceFilter;
  sourceFilters?: readonly ShapeBrowserSourceFilter[];
  onQueryChange: (value: string) => void;
  onSourceFilterChange: (filter: ShapeBrowserSourceFilter) => void;
}) {
  return (
    <div className="space-y-2">
      <SearchField
        label={translate('editor.shapeCatalog.browser.searchLabel')}
        placeholder={translate('editor.shapeCatalog.browser.searchPlaceholder')}
        value={props.query}
        onChange={props.onQueryChange}
      />
      {props.showSourceFilters === false ? null : (
        <SourceFilters
          value={props.sourceFilter}
          {...(props.sourceFilters ? { filters: props.sourceFilters } : {})}
          onChange={props.onSourceFilterChange}
        />
      )}
      <ImportDiagnostics {...(props.importState ? { state: props.importState } : {})} />
    </div>
  );
}

function ShapeBrowserList(props: {
  expandedCategories: ReadonlySet<string>;
  groups: ReturnType<typeof groupShapeBrowserEntries>;
  selectedEntryId: string | null;
  onDeleteCustomShape?: (entry: ShapeBrowserEntry) => void;
  onDisableCustomShape?: (entry: ShapeBrowserEntry) => void;
  onSelect: (entry: ShapeBrowserEntry) => void;
  onToggleExpanded: (category: ShapeBrowserCategory) => void;
}) {
  return (
    <div
      className="min-h-0 flex-[4_1_0%] space-y-4 overflow-y-auto pr-1"
      data-shape-browser-list="true"
    >
      {props.groups.map((group) => (
        <CategorySection
          key={group.category}
          group={group}
          expanded={props.expandedCategories.has(group.category)}
          selectedEntryId={props.selectedEntryId}
          onToggleExpanded={props.onToggleExpanded}
          onSelect={props.onSelect}
          {...(props.onDeleteCustomShape ? { onDelete: props.onDeleteCustomShape } : {})}
          {...(props.onDisableCustomShape ? { onDisable: props.onDisableCustomShape } : {})}
        />
      ))}
    </div>
  );
}

function ShapeBrowserImportFooter(props: {
  showImport?: boolean;
  onImportFile?: (file: File) => void;
}) {
  if (props.showImport === false) {
    return null;
  }
  return (
    <div className="shrink-0" data-shape-browser-import="footer">
      <ImportShapeControl {...(props.onImportFile ? { onImportFile: props.onImportFile } : {})} />
    </div>
  );
}

function useShapeBrowserModel(props: ShapeBrowserProps) {
  const initialState = React.useMemo(
    () => createInitialState(props.defaultSourceFilter ?? 'all'),
    [props.defaultSourceFilter]
  );
  const allEntries = React.useMemo(() => {
    const excluded = new Set(props.excludedCategories ?? []);
    return [...createBuiltInShapeBrowserEntries(), ...(props.additionalEntries ?? [])].filter(
      (entry) => !excluded.has(entry.category)
    );
  }, [props.additionalEntries, props.excludedCategories]);
  const [query, setQuery] = React.useState(initialState.query);
  const [selectedEntryId, setSelectedEntryId] = React.useState(initialState.selectedEntryId);
  const [sourceFilter, setSourceFilterState] = React.useState<ShapeBrowserSourceFilter>(
    initialState.sourceFilter
  );
  const [expandedCategories, setExpandedCategories] = React.useState<ReadonlySet<string>>(
    () => initialState.expandedCategories
  );
  const filteredEntries = React.useMemo(
    () => filterShapeBrowserEntries({ entries: allEntries, query, sourceFilter }),
    [allEntries, query, sourceFilter]
  );
  return {
    allEntries,
    expandedCategories,
    groups: React.useMemo(() => groupShapeBrowserEntries(filteredEntries), [filteredEntries]),
    query,
    selectedEntryId,
    setExpandedCategories,
    setQuery,
    setSelectedEntryId,
    setSourceFilterState,
    sourceFilter,
  };
}

function useShapeBrowserActions(
  model: ReturnType<typeof useShapeBrowserModel>,
  onSelect: ShapeBrowserProps['onSelect']
) {
  const { setExpandedCategories, setQuery, setSelectedEntryId, setSourceFilterState } = model;
  const toggleExpanded = React.useCallback(
    (category: ShapeBrowserCategory) => {
      setExpandedCategories((state) => {
        const next = new Set(state);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        return next;
      });
    },
    [setExpandedCategories]
  );
  const handleSelect = React.useCallback(
    (entry: ShapeBrowserEntry) => {
      setSelectedEntryId(entry.id);
      onSelect(entry);
    },
    [onSelect, setSelectedEntryId]
  );
  return {
    handleSelect,
    setSearchQuery: setQuery,
    setSourceFilter: setSourceFilterState,
    toggleExpanded,
  };
}

export function ShapeBrowser(props: ShapeBrowserProps) {
  const model = useShapeBrowserModel(props);
  const actions = useShapeBrowserActions(model, props.onSelect);
  const primaryEntries = React.useMemo(
    () => getPrimaryShapeBrowserEntries(model.allEntries),
    [model.allEntries]
  );
  const activeSelectedEntryId = props.selectedEntryId ?? model.selectedEntryId;

  return (
    <ShapeBrowserContent
      actions={actions}
      activeSelectedEntryId={activeSelectedEntryId}
      model={model}
      primaryEntries={primaryEntries}
      props={props}
    />
  );
}

function ShapeBrowserContent(args: {
  actions: ReturnType<typeof useShapeBrowserActions>;
  activeSelectedEntryId: string | null;
  model: ReturnType<typeof useShapeBrowserModel>;
  primaryEntries: readonly ShapeBrowserEntry[];
  props: ShapeBrowserProps;
}) {
  const { actions, activeSelectedEntryId, model, props, primaryEntries } = args;
  return (
    <PanelSection label={props.title ?? translate('editor.shapeCatalog.browser.title')}>
      <div
        className="flex h-[min(44rem,calc(100vh-18rem))] min-h-0 flex-col gap-4 overflow-hidden"
        onKeyDown={handleBrowserKeyDown}
      >
        {props.showPrimaryShortcuts === false ? null : (
          <PrimaryShortcutRow
            entries={primaryEntries}
            selectedEntryId={activeSelectedEntryId}
            onSelect={actions.handleSelect}
          />
        )}
        <ShapeBrowserControls
          query={model.query}
          sourceFilter={model.sourceFilter}
          {...(props.showSourceFilters === undefined
            ? {}
            : { showSourceFilters: props.showSourceFilters })}
          {...(props.sourceFilters === undefined ? {} : { sourceFilters: props.sourceFilters })}
          {...(props.importState === undefined ? {} : { importState: props.importState })}
          onQueryChange={actions.setSearchQuery}
          onSourceFilterChange={actions.setSourceFilter}
        />
        <ShapeBrowserResults
          actions={actions}
          activeSelectedEntryId={activeSelectedEntryId}
          model={model}
          props={props}
        />
        <ShapeBrowserImportFooter
          {...(props.showImport === undefined ? {} : { showImport: props.showImport })}
          {...(props.onImportFile ? { onImportFile: props.onImportFile } : {})}
        />
      </div>
    </PanelSection>
  );
}

function ShapeBrowserResults(args: {
  actions: ReturnType<typeof useShapeBrowserActions>;
  activeSelectedEntryId: string | null;
  model: ReturnType<typeof useShapeBrowserModel>;
  props: ShapeBrowserProps;
}) {
  if (args.model.groups.length === 0) {
    return (
      <ShapeBrowserEmptyState
        sourceFilter={args.model.sourceFilter}
        {...(args.props.importState === undefined ? {} : { importState: args.props.importState })}
      />
    );
  }

  return (
    <ShapeBrowserList
      groups={args.model.groups}
      expandedCategories={args.model.expandedCategories}
      selectedEntryId={args.activeSelectedEntryId}
      onToggleExpanded={args.actions.toggleExpanded}
      onSelect={args.actions.handleSelect}
      {...(args.props.onDeleteCustomShape
        ? { onDeleteCustomShape: args.props.onDeleteCustomShape }
        : {})}
      {...(args.props.onDisableCustomShape
        ? { onDisableCustomShape: args.props.onDisableCustomShape }
        : {})}
    />
  );
}
