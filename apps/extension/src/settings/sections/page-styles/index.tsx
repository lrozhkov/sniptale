import { Paintbrush, Search } from 'lucide-react';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../platform/i18n';
import { ProductSelect, type ProductSelectOption } from '@sniptale/ui/product-form-controls';
import {
  settingsEmptyStateClassName,
  settingsPanelClassName,
  settingsSectionClassName,
  SettingsSectionHeader,
} from '../../section-surface';
import { DelayedSettingsCardLoadingState } from '../../section-surface/loading-state';
import { usePageStyleRulesController } from './controller';
import { PageStyleRuleRow } from './rule-row';
import type { PageStyleRuleStatusFilter } from './types';

const inputClassName = [
  'h-10 min-w-0 rounded-[12px] border px-3 text-sm outline-none transition-colors',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
  'placeholder:text-[var(--sniptale-color-text-dim)]',
  'focus:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_56%,var(--sniptale-color-border-soft))]',
].join(' ');

const STATUS_FILTERS: PageStyleRuleStatusFilter[] = [
  'all',
  'enabled',
  'disabled',
  'contentRetaining',
  'assetBacked',
];

function statusFilterLabel(status: PageStyleRuleStatusFilter): string {
  if (status === 'enabled') {
    return translate('settings.pageStyles.enabled');
  }

  if (status === 'disabled') {
    return translate('settings.pageStyles.disabled');
  }

  if (status === 'contentRetaining') {
    return translate('settings.pageStyles.contentRetaining');
  }

  if (status === 'assetBacked') {
    return translate('settings.pageStyles.assetBacked');
  }

  return translate('settings.pageStyles.allStatuses');
}

function propertyFilterLabel(property: PageStyleProperty): string {
  return translate(`settings.pageStyles.properties.${property}`);
}

function createPropertyFilterOptions(
  properties: PageStyleProperty[]
): ProductSelectOption<PageStyleProperty | 'all'>[] {
  return [
    { label: translate('settings.pageStyles.allProperties'), value: 'all' },
    ...properties.map((property) => ({
      label: propertyFilterLabel(property),
      value: property,
    })),
  ];
}

function createStatusFilterOptions(): ProductSelectOption<PageStyleRuleStatusFilter>[] {
  return STATUS_FILTERS.map((status) => ({
    label: statusFilterLabel(status),
    value: status,
  }));
}

function PageStyleFilters(props: ReturnType<typeof usePageStyleRulesController>) {
  return (
    <section className={[settingsPanelClassName, 'grid gap-4 p-4'].join(' ')}>
      <SearchFilterInput
        label={translate('settings.pageStyles.searchLabel')}
        placeholder={translate('settings.pageStyles.searchPlaceholder')}
        value={props.state.searchQuery}
        onChange={props.setSearchQuery}
      />
      <SearchFilterInput
        label={translate('settings.pageStyles.addressLabel')}
        placeholder={translate('settings.pageStyles.addressPlaceholder')}
        value={props.state.addressQuery}
        onChange={props.setAddressQuery}
      />
      <FilterSelects {...props} />
    </section>
  );
}

function SearchFilterInput(props: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
      {props.label}
      <span className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sniptale-color-text-dim)]"
        />
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          placeholder={props.placeholder}
          className={[inputClassName, 'w-full pl-9'].join(' ')}
        />
      </span>
    </label>
  );
}

function FilterSelects(props: ReturnType<typeof usePageStyleRulesController>) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <PropertyFilterSelect {...props} />
      <StatusFilterSelect {...props} />
    </div>
  );
}

function PropertyFilterSelect(props: ReturnType<typeof usePageStyleRulesController>) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
      {translate('settings.pageStyles.propertyLabel')}
      <ProductSelect<PageStyleProperty | 'all'>
        aria-label={translate('settings.pageStyles.propertyLabel')}
        controlSize="md"
        options={createPropertyFilterOptions(props.propertyOptions)}
        value={props.state.propertyFilter}
        onChange={props.setPropertyFilter}
      />
    </label>
  );
}

function StatusFilterSelect(props: ReturnType<typeof usePageStyleRulesController>) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
      {translate('settings.pageStyles.statusLabel')}
      <ProductSelect<PageStyleRuleStatusFilter>
        aria-label={translate('settings.pageStyles.statusLabel')}
        controlSize="md"
        options={createStatusFilterOptions()}
        value={props.state.statusFilter}
        onChange={props.setStatusFilter}
      />
    </label>
  );
}

function PageStyleRulesEmptyState(props: { filtered: boolean; loading: boolean }) {
  if (props.loading) {
    return <DelayedSettingsCardLoadingState />;
  }

  return (
    <div className={settingsEmptyStateClassName}>
      <Paintbrush size={30} className="mx-auto mb-3 text-[var(--sniptale-color-text-dim)]" />
      <p className="text-sm text-[var(--sniptale-color-text-muted)]">
        {props.filtered
          ? translate('settings.pageStyles.emptyFilteredTitle')
          : translate('settings.pageStyles.emptyTitle')}
      </p>
    </div>
  );
}

function PageStyleRulesList(props: ReturnType<typeof usePageStyleRulesController>) {
  const hasFilters =
    props.state.searchQuery.trim() ||
    props.state.addressQuery.trim() ||
    props.state.propertyFilter !== 'all' ||
    props.state.statusFilter !== 'all';

  if (props.state.filteredItems.length === 0) {
    return (
      <PageStyleRulesEmptyState filtered={Boolean(hasFilters)} loading={props.state.isLoading} />
    );
  }

  return (
    <div className="space-y-3">
      {props.state.filteredItems.map((item) => (
        <PageStyleRuleRow
          key={item.rule.id}
          draft={props.state.drafts[item.rule.id] ?? item.draft}
          isMutating={props.state.isMutating}
          item={item}
          onClearDomain={() => props.clearDomain(item.rule.id)}
          onDelete={() => void props.deleteRule(item.rule.id)}
          onDraftChange={(draft) => props.setDraft(item.rule.id, draft)}
          onSaveScope={() => void props.saveScope(item.rule.id)}
          onToggleEnabled={() => void props.toggleEnabled(item.rule)}
        />
      ))}
    </div>
  );
}

function PageStyleFeedback(props: {
  actionError: string | null;
  confirmationMessage: string | null;
  loadError: string | null;
}) {
  const feedbackClassName = [
    'rounded-[12px] border px-3 py-2 text-sm',
    props.loadError || props.actionError
      ? 'border-[var(--sniptale-color-danger)] text-[var(--sniptale-color-danger)]'
      : 'border-[var(--sniptale-color-success)] text-[var(--sniptale-color-success)]',
  ].join(' ');

  if (props.loadError || props.actionError) {
    return <p className={feedbackClassName}>{props.loadError ?? props.actionError}</p>;
  }

  if (props.confirmationMessage) {
    return <p className={feedbackClassName}>{props.confirmationMessage}</p>;
  }

  return null;
}

export function PageStylesSection() {
  const controller = usePageStyleRulesController();

  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('settings.pageStyles.subtitle')}
        kicker={translate('settings.navigation.pageStyles')}
      />
      <PageStyleFeedback
        actionError={controller.state.actionError}
        confirmationMessage={controller.state.confirmationMessage}
        loadError={controller.state.loadError}
      />
      <PageStyleFilters {...controller} />
      <PageStyleRulesList {...controller} />
    </div>
  );
}
