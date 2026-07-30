import { translate } from '../../../../platform/i18n';
import { PageStylePropertyControls } from '../property-controls/view';
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

export function InspectorProperties(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  const disabled = !props.state.selection;
  return (
    <div className="grid gap-2.5">
      {disabled ? <EmptySelectionNotice /> : null}
      <PageStylePropertyControls actions={props.actions} disabled={disabled} state={props.state} />
    </div>
  );
}
