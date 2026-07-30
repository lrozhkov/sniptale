import { translate } from '../../../../../platform/i18n';
import { Section } from '../section';
import { NumericField } from '../numeric-field';
import { LinkedSideFields, SIDE_ORDER, createSideProperty } from '../side-fields';
import { changedSummary, countModified, fieldState } from '../helpers';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';

type SectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
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
      title={translate('content.designReview.sectionFrame')}
      summary={changedSummary(countModified(state, FRAME_PROPERTIES))}
    >
      <FrameSizeFields actions={actions} disabled={disabled} state={state} />
      <LinkedSideFields
        disabled={disabled}
        label={translate('content.designReview.margin')}
        properties={SIDE_ORDER.map((side) => createSideProperty('margin', side))}
        state={state}
        onChange={actions.updateValue}
        onChangeMany={actions.updateValues}
        onLinkedChange={actions.setSideFieldLinked}
      />
      <LinkedSideFields
        disabled={disabled}
        label={translate('content.designReview.padding')}
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
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-2">
      <NumericField
        disabled={disabled}
        label={translate('content.designReview.width')}
        {...fieldState(state, actions, 'width')}
        onChange={(value) => actions.updateValue('width', value)}
      />
      <NumericField
        disabled={disabled}
        label={translate('content.designReview.height')}
        {...fieldState(state, actions, 'height')}
        onChange={(value) => actions.updateValue('height', value)}
      />
    </div>
  );
}
