import { Power, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import { InspectorEmptyList, InspectorSearchInput } from '../list-controls';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { RegistryActionStatusBanner, useRegistryActionRunner } from './action-status';
import { RegistryStatusNotice } from './status';
export { TemplatesTab } from '../templates/tab';

type SecondaryAction = {
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function ListRow(props: {
  actionLabel: string;
  badge?: string;
  disabled: boolean;
  meta: string;
  onAction: () => void;
  secondaryActions?: SecondaryAction[];
  title: string;
}) {
  return (
    <div
      className={[
        'grid grid-cols-[1fr_auto] items-center gap-2 rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)] p-2',
      ].join(' ')}
    >
      <ListRowText
        meta={props.meta}
        title={props.title}
        {...(props.badge ? { badge: props.badge } : {})}
      />
      <ListRowActions {...props} />
    </div>
  );
}

function ListRowText(props: { badge?: string; meta: string; title: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs font-bold text-[var(--sniptale-color-text-primary)]">
        {props.title}
      </div>
      <div className="truncate text-[11px] text-[var(--sniptale-color-text-dim)]">{props.meta}</div>
      {props.badge ? (
        <div className="mt-1 text-[10px] font-semibold text-[var(--sniptale-color-accent)]">
          {props.badge}
        </div>
      ) : null}
    </div>
  );
}

function ListRowActions(props: {
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
  secondaryActions?: SecondaryAction[];
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={props.disabled}
        className={[
          'h-8 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] px-3',
          'text-xs font-bold disabled:opacity-45',
        ].join(' ')}
        onClick={props.onAction}
      >
        {props.actionLabel}
      </button>
      {props.secondaryActions?.map((action) => (
        <SecondaryActionButton key={action.label} action={action} />
      ))}
    </div>
  );
}

function SecondaryActionButton({ action }: { action: SecondaryAction }) {
  return (
    <button
      type="button"
      aria-label={action.label}
      title={action.label}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border',
        'border-[color:var(--sniptale-color-border-soft)]',
        action.danger
          ? 'text-[var(--sniptale-color-danger)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      onClick={action.onClick}
    >
      {action.icon}
    </button>
  );
}

export function RulesTab(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  const actionRunner = useRegistryActionRunner();
  const query = props.state.ruleQuery.trim().toLocaleLowerCase();
  const rules = props.state.rules.filter((rule) =>
    [rule.name, rule.selector.locator, rule.propertySummary.join(' ')]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  );

  if (props.state.rules.length === 0) {
    return (
      <div className="grid gap-2">
        <RegistryStatusNotice
          error={props.state.registryError}
          loading={props.state.registryLoading}
        />
        <InspectorEmptyList copy={translate('content.pageStyleInspector.noRules')} />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <RegistryStatusNotice
        error={props.state.registryError}
        loading={props.state.registryLoading}
      />
      <InspectorSearchInput
        value={props.state.ruleQuery}
        placeholder={translate('content.pageStyleInspector.searchRules')}
        onChange={props.actions.setRuleQuery}
      />
      <RegistryActionStatusBanner status={actionRunner.status} />
      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
        {rules.map((rule) => (
          <RuleRow key={rule.id} actions={props.actions} actionRunner={actionRunner} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function RuleRow(props: {
  actions: PageStyleInspectorActions;
  actionRunner: ReturnType<typeof useRegistryActionRunner>;
  rule: PageStyleInspectorViewState['rules'][number];
}) {
  return (
    <ListRow
      title={props.rule.name}
      meta={
        props.rule.scope.active === 'domain'
          ? translate('content.pageStyleInspector.domainScope')
          : translate('content.pageStyleInspector.exactAddressScope')
      }
      actionLabel={translate('content.pageStyleInspector.applyRule')}
      disabled={!props.rule.enabled}
      onAction={() => void props.actions.applyRule(props.rule)}
      badge={
        props.rule.enabled
          ? translate('content.pageStyleInspector.ruleEnabled')
          : translate('content.pageStyleInspector.ruleDisabled')
      }
      secondaryActions={createRuleActions(props)}
    />
  );
}

function createRuleActions(props: {
  actions: PageStyleInspectorActions;
  actionRunner: ReturnType<typeof useRegistryActionRunner>;
  rule: PageStyleInspectorViewState['rules'][number];
}): SecondaryAction[] {
  return [
    {
      icon: <Power size={14} />,
      label: props.rule.enabled
        ? translate('content.pageStyleInspector.disableRule')
        : translate('content.pageStyleInspector.enableRule'),
      onClick: () => void props.actions.toggleRuleEnabled(props.rule),
    },
    {
      danger: true,
      icon: <Trash2 size={14} />,
      label: translate('content.pageStyleInspector.deleteRule'),
      onClick: () =>
        void props.actionRunner.run({
          action: () => props.actions.deleteRule(props.rule),
          successMessage: translate('content.pageStyleInspector.ruleDeleted'),
        }),
    },
  ];
}
