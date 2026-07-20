import { Save, Trash2, X } from 'lucide-react';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
import { formatDateTime, translate } from '../../../platform/i18n';
import {
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
  SettingsSwitch,
} from '../../section-surface/panel-controls';
import type { PageStyleRuleDraft, PageStyleRuleListItem } from './types';

const fieldClassName = [
  'h-9 min-w-0 rounded-[10px] border px-3 text-xs outline-none transition-colors',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
  'focus:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_54%,var(--sniptale-color-border-soft))]',
].join(' ');

function ScopeButton(props: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      data-active={props.active}
      onClick={props.onClick}
      className={[
        'h-8 rounded-[9px] px-3 text-xs font-semibold transition-colors',
        'text-[var(--sniptale-color-text-secondary)]',
        'data-[active=true]:bg-[var(--sniptale-color-surface-panel)]',
        'data-[active=true]:text-[var(--sniptale-color-text-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ].join(' ')}
    >
      {props.label}
    </button>
  );
}

function RuleBadges({ item }: { item: PageStyleRuleListItem }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={
          item.rule.enabled ? settingsSuccessBadgeClassName : settingsNeutralBadgeClassName
        }
      >
        {item.rule.enabled
          ? translate('settings.pageStyles.enabled')
          : translate('settings.pageStyles.disabled')}
      </span>
      {item.rule.contentRetention?.text ? (
        <span className={settingsNeutralBadgeClassName}>
          {translate('settings.pageStyles.retentionText')}
        </span>
      ) : null}
      {item.rule.contentRetention?.image ? (
        <span className={settingsNeutralBadgeClassName}>
          {translate('settings.pageStyles.retentionImage')}
        </span>
      ) : null}
      {item.assetReferenceCount > 0 ? (
        <span className={settingsNeutralBadgeClassName}>
          {translate('settings.pageStyles.assetReferences')}: {item.assetReferenceCount}
        </span>
      ) : null}
    </div>
  );
}

function RuleMetadata({ item }: { item: PageStyleRuleListItem }) {
  return (
    <div className="grid gap-1 text-xs text-[var(--sniptale-color-text-dim)] md:grid-cols-2">
      <span>
        {translate('settings.pageStyles.createdAt')}:{' '}
        {formatDateTime(item.rule.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
      </span>
      <span>
        {translate('settings.pageStyles.updatedAt')}:{' '}
        {formatDateTime(item.rule.updatedAt, { dateStyle: 'short', timeStyle: 'short' })}
      </span>
    </div>
  );
}
function RuleScopeEditor(props: {
  draft: PageStyleRuleDraft;
  disabled: boolean;
  onChange: (draft: PageStyleRuleDraft) => void;
  onClearDomain: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <ScopeInputs draft={props.draft} disabled={props.disabled} onChange={props.onChange} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScopeModeButtons {...props} />
        <ScopeIconActions {...props} />
      </div>
    </div>
  );
}
function ScopeInputs(props: {
  draft: PageStyleRuleDraft;
  disabled: boolean;
  onChange: (draft: PageStyleRuleDraft) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.42fr)]">
      <ScopeInput
        disabled={props.disabled}
        label={translate('settings.pageStyles.exactAddressLabel')}
        value={props.draft.exactAddress}
        onChange={(exactAddress) => props.onChange({ ...props.draft, exactAddress })}
      />
      <ScopeInput
        disabled={props.disabled}
        label={translate('settings.pageStyles.domainLabel')}
        placeholder={translate('settings.pageStyles.domainPlaceholder')}
        value={props.draft.domain}
        onChange={(domain) => props.onChange({ ...props.draft, domain })}
      />
    </div>
  );
}
function ScopeInput(props: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--sniptale-color-text-muted)]">
      {props.label}
      <input
        className={fieldClassName}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}
function ScopeModeButtons(props: {
  draft: PageStyleRuleDraft;
  disabled: boolean;
  onChange: (draft: PageStyleRuleDraft) => void;
}) {
  return (
    <div className="inline-grid grid-cols-2 gap-1 rounded-[11px] bg-[var(--sniptale-color-surface-input)] p-1">
      <ScopeButton
        active={props.draft.active === PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS}
        disabled={props.disabled}
        label={translate('settings.pageStyles.useExact')}
        onClick={() =>
          props.onChange({ ...props.draft, active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS })
        }
      />
      <ScopeButton
        active={props.draft.active === PAGE_STYLE_SCOPE_TYPES.DOMAIN}
        disabled={props.disabled}
        label={translate('settings.pageStyles.useDomain')}
        onClick={() => props.onChange({ ...props.draft, active: PAGE_STYLE_SCOPE_TYPES.DOMAIN })}
      />
    </div>
  );
}
function ScopeIconActions(props: {
  draft: PageStyleRuleDraft;
  disabled: boolean;
  onClearDomain: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={props.disabled || !props.draft.domain}
        onClick={props.onClearDomain}
        className={settingsInfoIconButtonClassName}
        title={translate('settings.pageStyles.clearDomain')}
      >
        <X size={15} />
      </button>
      <button
        type="button"
        disabled={props.disabled || !props.draft.exactAddress.trim()}
        onClick={props.onSave}
        className={settingsInfoIconButtonClassName}
        title={translate('settings.pageStyles.saveScope')}
      >
        <Save size={15} />
      </button>
    </div>
  );
}
export function PageStyleRuleRow(props: {
  draft: PageStyleRuleDraft;
  isMutating: boolean;
  item: PageStyleRuleListItem;
  onClearDomain: () => void;
  onDelete: () => void;
  onDraftChange: (draft: PageStyleRuleDraft) => void;
  onSaveScope: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <article className={[settingsListRowClassName, 'items-start'].join(' ')}>
      <div className="min-w-0 flex-1 space-y-4">
        <RuleHeader item={props.item} />
        <RuleScopeSummary item={props.item} />
        <RuleScopeEditor
          draft={props.draft}
          disabled={props.isMutating}
          onChange={props.onDraftChange}
          onClearDomain={props.onClearDomain}
          onSave={props.onSaveScope}
        />
        <RuleMetadata item={props.item} />
      </div>
      <RuleActions {...props} />
    </article>
  );
}

function RuleHeader({ item }: { item: PageStyleRuleListItem }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {item.rule.name}
        </h3>
        <p className="truncate text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('settings.pageStyles.selectorLabel')}: {item.rule.selector.locator}
        </p>
      </div>
      <RuleBadges item={item} />
    </div>
  );
}

function RuleScopeSummary({ item }: { item: PageStyleRuleListItem }) {
  const properties = item.rule.propertySummary.join(', ');

  return (
    <div className="grid gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
      <span className="break-all">
        {translate('settings.pageStyles.exactScope')}: {item.exactAddressText}
      </span>
      {item.domainText ? (
        <span>
          {translate('settings.pageStyles.domainScope')}: {item.domainText}
        </span>
      ) : null}
      <span>
        {translate('settings.pageStyles.propertiesLabel')}: {properties || '-'}
      </span>
    </div>
  );
}

function RuleActions(props: {
  isMutating: boolean;
  item: PageStyleRuleListItem;
  onDelete: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      <SettingsSwitch
        checked={props.item.rule.enabled}
        disabled={props.isMutating}
        onClick={props.onToggleEnabled}
        aria-label={
          props.item.rule.enabled
            ? translate('settings.pageStyles.disabled')
            : translate('settings.pageStyles.enabled')
        }
      />
      <button
        type="button"
        disabled={props.isMutating}
        onClick={props.onDelete}
        className={settingsDangerIconButtonClassName}
        title={translate('settings.pageStyles.deleteRule')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
