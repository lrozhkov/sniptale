import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import { isPageStyleRulesUiEnabled } from '../../../../platform/config/page-style-rules-access';
import { PageStylePropertyControls } from '../property-controls/view';
import { RulesTab, TemplatesTab } from '../registry/tabs';
import { SavePanel } from '../save/panel';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

function EmptySelectionNotice() {
  return (
    <div
      className={[
        'rounded-[10px] border border-[color:var(--sniptale-color-border-soft)] p-3',
        'text-xs text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      <p className="font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('content.pageStyleInspector.emptySelectionTitle')}
      </p>
      <p className="mt-1">{translate('content.pageStyleInspector.emptySelectionHint')}</p>
    </div>
  );
}

function PropertiesTab(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  const disabled = !props.state.selection;

  return (
    <div className="grid gap-2.5">
      {disabled ? <EmptySelectionNotice /> : null}
      <PageStylePropertyControls actions={props.actions} disabled={disabled} state={props.state} />
      <SavePanel actions={props.actions} disabled={disabled} state={props.state} />
    </div>
  );
}

export function ActiveTab(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  switch (props.state.activeTab) {
    case PAGE_STYLE_INSPECTOR_TABS.TEMPLATES:
      return <TemplatesTab actions={props.actions} state={props.state} />;
    case PAGE_STYLE_INSPECTOR_TABS.RULES:
      return isPageStyleRulesUiEnabled() ? (
        <RulesTab actions={props.actions} state={props.state} />
      ) : (
        <PropertiesTab actions={props.actions} state={props.state} />
      );
    case PAGE_STYLE_INSPECTOR_TABS.PROPERTIES:
    default:
      return <PropertiesTab actions={props.actions} state={props.state} />;
  }
}
