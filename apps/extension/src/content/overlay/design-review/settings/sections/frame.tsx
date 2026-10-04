import { translate } from '../../../../../platform/i18n';
import { NumericField } from '../numeric-field';
import { LinkedSideFields, SIDE_ORDER, createSideProperty } from '../side-fields';
import { fieldState } from '../helpers';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';

type SectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

export function BoxSection({ actions, disabled, state }: SectionProps) {
  return (
    <div className="grid gap-2" data-ui="content.design-review.settings-layout">
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
    </div>
  );
}

function FrameSizeFields({ actions, disabled, state }: SectionProps) {
  return (
    <div className="grid grid-cols-1 gap-y-2">
      <NumericField
        disabled={disabled}
        label={translate('content.designReview.width')}
        stacked
        {...fieldState(state, actions, 'width')}
        onChange={(value) => actions.updateValue('width', value)}
      />
      <NumericField
        disabled={disabled}
        label={translate('content.designReview.height')}
        stacked
        {...fieldState(state, actions, 'height')}
        onChange={(value) => actions.updateValue('height', value)}
      />
    </div>
  );
}
