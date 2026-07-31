import { translate } from '../../../../../platform/i18n';
import { ColorField } from '../choice-fields';
import { NumericField } from '../numeric-field';
import { fieldState } from '../helpers';
import { TextAlignButtons, TextModeButtons } from '../text/buttons';
import {
  getFontFamilyOptions,
  getLetterSpacingOptions,
  getLineHeightOptions,
} from '../text/options';
import { TextSelectField } from '../text/select-field';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';

type SectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

export function TextSection({ actions, disabled, state }: SectionProps) {
  const change = actions.updateValue;

  return (
    <div className="grid gap-2" data-ui="content.design-review.settings-text">
      <div className="grid gap-2">
        <TextModeButtons actions={actions} disabled={disabled} state={state} />
        <TextAlignButtons actions={actions} disabled={disabled} state={state} />
      </div>
      <div
        data-ui="content.design-review.typography-fields"
        className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-2"
      >
        <div className="col-span-2">
          <ColorField
            disabled={disabled}
            label={translate('content.designReview.color')}
            {...fieldState(state, actions, 'color')}
            onChange={(value) => change('color', value)}
          />
        </div>
        <TextSelectField
          className="col-span-2"
          disabled={disabled}
          label={translate('content.designReview.fontFamily')}
          options={getFontFamilyOptions(fieldState(state, actions, 'font-family').value)}
          {...fieldState(state, actions, 'font-family')}
          onChange={(value) => change('font-family', value)}
        />
        <TextNumericFields actions={actions} disabled={disabled} state={state} />
      </div>
    </div>
  );
}

function TextNumericFields({ actions, disabled, state }: SectionProps) {
  const change = actions.updateValue;

  return (
    <>
      <NumericField
        disabled={disabled}
        label={translate('content.designReview.fontSize')}
        {...fieldState(state, actions, 'font-size')}
        onChange={(value) => change('font-size', value)}
      />
      <TextSelectField
        disabled={disabled}
        label={translate('content.designReview.lineHeight')}
        options={getLineHeightOptions(fieldState(state, actions, 'line-height').value)}
        {...fieldState(state, actions, 'line-height')}
        onChange={(value) => change('line-height', value)}
      />
      <TextSelectField
        className="col-span-2"
        disabled={disabled}
        label={translate('content.designReview.letterSpacing')}
        options={getLetterSpacingOptions(fieldState(state, actions, 'letter-spacing').value)}
        {...fieldState(state, actions, 'letter-spacing')}
        onChange={(value) => change('letter-spacing', value)}
      />
    </>
  );
}
