import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import {
  DESIGN_SYSTEM_KIND_FILTERS,
  DESIGN_SYSTEM_SCOPE_FILTERS,
  DESIGN_SYSTEM_USAGE_MODES,
} from '../../catalog/registry/page-controls';
import type { AppTheme } from '../../../ui/theme';
import { localize } from '../../catalog/localization';
import { DesignSystemThemeChips, FilterChip, ResultBadge, ToolbarButton } from './primitives';
import type { DesignSystemPageState } from './state';

const FILTERS_SECTION_CLASS =
  'sticky top-4 z-40 rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,var(--sniptale-color-surface-canvas)_10%)] ' +
  'px-4 py-4 shadow-sm backdrop-blur-sm';

const SEARCH_LABEL_CLASS =
  'relative block w-full rounded-[14px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_88%,transparent)]';

const SEARCH_INPUT_CLASS =
  'w-full rounded-[14px] bg-transparent py-3 pl-10 pr-3 text-sm text-[var(--sniptale-color-text-primary)] ' +
  'outline-none transition focus:border-[var(--sniptale-color-border-accent-strong)]';

const SEARCH_ICON_CLASS =
  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ' +
  'text-[var(--sniptale-color-text-muted)]';

const FILTER_PANEL_CLASS =
  'mt-4 rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] p-4';

const PANEL_LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sniptale-color-text-muted-strong)]';

function DesignSystemSearchField(props: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={SEARCH_LABEL_CLASS}>
      <Search className={SEARCH_ICON_CLASS} />
      <input
        type="search"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className={SEARCH_INPUT_CLASS}
      />
    </label>
  );
}

export function DesignSystemFiltersSection(props: {
  locale: AppLocale;
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
  state: DesignSystemPageState;
}) {
  return (
    <section className={FILTERS_SECTION_CLASS}>
      <DesignSystemWorkspaceRow
        locale={props.locale}
        previewTheme={props.previewTheme}
        setPreviewTheme={props.setPreviewTheme}
        state={props.state}
      />
      {props.state.selectedUsageOptions.length > 0 ? (
        <DesignSystemSelectedUsageSummary locale={props.locale} state={props.state} />
      ) : null}
      {props.state.isFilterPanelOpen ? (
        <DesignSystemFilterPanel locale={props.locale} state={props.state} />
      ) : null}
    </section>
  );
}

function DesignSystemWorkspaceRow(props: {
  locale: AppLocale;
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
  state: DesignSystemPageState;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_auto_auto] xl:items-center">
      <DesignSystemSearchField
        value={props.state.searchQuery}
        onChange={props.state.setSearchQuery}
        placeholder={translate('designSystem.page.searchPlaceholder')}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ResultBadge
          label={translate('designSystem.page.resultsLabel', props.locale)}
          value={props.state.filteredEntriesCount}
        />
        <div className="flex flex-wrap gap-2">
          <ToolbarButton
            label={translate(
              props.state.isFilterPanelOpen
                ? 'designSystem.page.hideFiltersButton'
                : 'designSystem.page.filtersButton',
              props.locale
            )}
            active={props.state.isFilterPanelOpen}
            onClick={props.state.toggleFilterPanel}
          />
          <ToolbarButton
            label={translate('designSystem.page.clearFilters', props.locale)}
            onClick={props.state.clearFilters}
            disabled={!props.state.hasActiveFilters}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 xl:justify-end">
        <DesignSystemThemeChips
          previewTheme={props.previewTheme}
          setPreviewTheme={props.setPreviewTheme}
        />
      </div>
    </div>
  );
}

function DesignSystemSelectedUsageSummary(props: {
  locale: AppLocale;
  state: DesignSystemPageState;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {props.state.selectedUsageOptions.map((usage) => (
        <FilterChip
          key={usage.usageId}
          label={localize(props.locale, usage.labelRu, usage.labelEn)}
          active
          onClick={() => props.state.toggleUsageFilter(usage.usageId)}
        />
      ))}
    </div>
  );
}

function DesignSystemFilterPanel(props: { locale: AppLocale; state: DesignSystemPageState }) {
  return (
    <section className={FILTER_PANEL_CLASS}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <DesignSystemFilterGroup
            label={translate('designSystem.page.filterAllScopes', props.locale)}
          >
            {DESIGN_SYSTEM_SCOPE_FILTERS.map((scope) => (
              <FilterChip
                key={scope.value}
                label={translate(scope.labelKey, props.locale)}
                active={props.state.scopeFilter === scope.value}
                onClick={() => props.state.setScopeFilter(scope.value)}
              />
            ))}
          </DesignSystemFilterGroup>

          <DesignSystemFilterGroup
            label={translate('designSystem.page.filterAllKinds', props.locale)}
          >
            {DESIGN_SYSTEM_KIND_FILTERS.map((kind) => (
              <FilterChip
                key={kind.value}
                label={translate(kind.labelKey, props.locale)}
                active={props.state.kindFilter === kind.value}
                onClick={() => props.state.setKindFilter(kind.value)}
              />
            ))}
          </DesignSystemFilterGroup>

          <DesignSystemFilterGroup
            label={translate('designSystem.page.filterUsageAny', props.locale)}
          >
            {DESIGN_SYSTEM_USAGE_MODES.map((usageMode) => (
              <FilterChip
                key={usageMode.value}
                label={translate(usageMode.labelKey, props.locale)}
                active={props.state.usageFilterMode === usageMode.value}
                onClick={() => props.state.setUsageFilterMode(usageMode.value)}
              />
            ))}
          </DesignSystemFilterGroup>
        </div>

        <DesignSystemUsageFilterList locale={props.locale} state={props.state} />
      </div>
    </section>
  );
}

function DesignSystemFilterGroup(props: { children: ReactNode; label: string }) {
  return (
    <section className="space-y-2">
      <div className={PANEL_LABEL_CLASS}>{props.label}</div>
      <div className="flex flex-wrap gap-1.5">{props.children}</div>
    </section>
  );
}

function DesignSystemUsageFilterList(props: { locale: AppLocale; state: DesignSystemPageState }) {
  return (
    <section className="space-y-3">
      <div className={PANEL_LABEL_CLASS}>
        {translate('designSystem.page.filterUsageAny', props.locale)}
      </div>
      <DesignSystemSearchField
        value={props.state.usageSearchQuery}
        onChange={props.state.setUsageSearchQuery}
        placeholder={translate('designSystem.page.usageSearchPlaceholder', props.locale)}
      />

      {props.state.filteredUsageOptions.length > 0 ? (
        <div className="max-h-[260px] overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-1.5">
            {props.state.filteredUsageOptions.map((usage) => (
              <FilterChip
                key={usage.usageId}
                label={localize(props.locale, usage.labelRu, usage.labelEn)}
                active={props.state.selectedUsageIds.includes(usage.usageId)}
                onClick={() => props.state.toggleUsageFilter(usage.usageId)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className={
            'rounded-[14px] border border-dashed border-[var(--sniptale-color-border-soft)] ' +
            'px-3 py-4 text-sm text-[var(--sniptale-color-text-secondary)]'
          }
        >
          {translate('designSystem.page.usageSearchEmpty', props.locale)}
        </div>
      )}
    </section>
  );
}
