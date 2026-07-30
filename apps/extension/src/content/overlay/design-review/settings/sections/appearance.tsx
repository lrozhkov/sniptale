import { translate } from '../../../../../platform/i18n';
import { ColorField } from '../choice-fields';
import { fieldState } from '../helpers';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { ShadowField } from '../appearance/shadow-field';

type SectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

export function AppearanceSection({ actions, disabled, state }: SectionProps) {
  return (
    <div className="grid gap-2" data-ui="content.design-review.settings-appearance">
      <ColorField
        disabled={disabled}
        label={translate('content.designReview.backgroundColor')}
        {...fieldState(state, actions, 'background-color')}
        onChange={(value) => actions.updateValue('background-color', value)}
      />
      <ShadowField
        disabled={disabled}
        label={translate('content.designReview.boxShadow')}
        {...fieldState(state, actions, 'box-shadow')}
        onChange={(value) => actions.updateValue('box-shadow', value)}
      />
    </div>
  );
}
