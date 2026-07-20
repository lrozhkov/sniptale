import { translate } from '../../../../../platform/i18n';
import { Section } from '../fields';
import { NumericField } from '../numeric-field';
import { LinkedSideFields, SIDE_ORDER, createSideProperty } from '../side-fields';
import { changedSummary, countModified, fieldState } from '../helpers';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';

type SectionProps = {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
};

const FRAME_PROPERTIES = [
  'width',
  'height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
] as const;

export function BoxSection({ actions, disabled, state }: SectionProps) {
  return (
    <Section
      title={translate('content.pageStyleInspector.sectionFrame')}
      summary={changedSummary(countModified(state, FRAME_PROPERTIES))}
    >
      <FrameSizeFields actions={actions} disabled={disabled} state={state} />
      <LinkedSideFields
        disabled={disabled}
        label={translate('content.pageStyleInspector.margin')}
        properties={SIDE_ORDER.map((side) => createSideProperty('margin', side))}
        state={state}
        onChange={actions.updateValue}
        onChangeMany={actions.updateValues}
        onLinkedChange={actions.setSideFieldLinked}
      />
      <LinkedSideFields
        disabled={disabled}
        label={translate('content.pageStyleInspector.padding')}
        properties={SIDE_ORDER.map((side) => createSideProperty('padding', side))}
        state={state}
        onChange={actions.updateValue}
        onChangeMany={actions.updateValues}
        onLinkedChange={actions.setSideFieldLinked}
      />
    </Section>
  );
}

function FrameSizeFields({ actions, disabled, state }: SectionProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <NumericField
        disabled={disabled}
        label={translate('content.pageStyleInspector.width')}
        {...fieldState(state, actions, 'width')}
        onChange={(value) => actions.updateValue('width', value)}
      />
      <NumericField
        disabled={disabled}
        label={translate('content.pageStyleInspector.height')}
        {...fieldState(state, actions, 'height')}
        onChange={(value) => actions.updateValue('height', value)}
      />
    </div>
  );
}
