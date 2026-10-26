import { useState } from 'react';
import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
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
  compact?: boolean | undefined;
};

export function TextSection({ actions, disabled, state, compact }: SectionProps) {
  const change = actions.updateValue;
  const [moreOpen, setMoreOpen] = useState(false);

  if (compact)
    return (
      <div className="grid gap-1" data-ui="content.design-review.settings-text">
        <TextSelectField
          disabled={disabled}
          label={translate('content.designReview.fontFamily')}
          options={getFontFamilyOptions(fieldState(state, actions, 'font-family').value)}
          {...fieldState(state, actions, 'font-family')}
          onChange={(value) => change('font-family', value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumericField
            disabled={disabled}
            label={translate('content.designReview.fontSize')}
            {...fieldState(state, actions, 'font-size')}
            onChange={(value) => change('font-size', value)}
          />
          <TextSelectField
            disabled={disabled}
            label={translate('content.designReview.fontWeight')}
            options={Array.from(
              new Set([
                fieldState(state, actions, 'font-weight').value,
                '100',
                '200',
                '300',
                '400',
                '500',
                '600',
                '700',
                '800',
                '900',
              ])
            )
              .filter(Boolean)
              .map((value) => ({ label: value, value }))}
            {...fieldState(state, actions, 'font-weight')}
            onChange={(value) => change('font-weight', value)}
          />
        </div>
        <ColorField
          disabled={disabled}
          label={translate('content.designReview.color')}
          {...fieldState(state, actions, 'color')}
          onChange={(value) => change('color', value)}
        />
        <TextAlignButtons actions={actions} disabled={disabled} state={state} />
        <InspectorDisclosureView
          dataUi="content.design-review.typography-more"
          variant="structural"
          label={translate('content.designReview.typographyMore')}
          open={moreOpen}
          onOpenChange={setMoreOpen}
          bodyClassName="grid gap-1 pt-2"
        >
          <TextModeButtons actions={actions} disabled={disabled} state={state} />
          <TextSelectField
            disabled={disabled}
            label={translate('content.designReview.lineHeight')}
            options={getLineHeightOptions(fieldState(state, actions, 'line-height').value)}
            {...fieldState(state, actions, 'line-height')}
            onChange={(value) => change('line-height', value)}
          />
          <TextSelectField
            disabled={disabled}
            label={translate('content.designReview.letterSpacing')}
            options={getLetterSpacingOptions(fieldState(state, actions, 'letter-spacing').value)}
            {...fieldState(state, actions, 'letter-spacing')}
            onChange={(value) => change('letter-spacing', value)}
          />
        </InspectorDisclosureView>
      </div>
    );

  return (
    <div className="grid gap-1" data-ui="content.design-review.settings-text">
      <div className="grid gap-1">
        <TextModeButtons actions={actions} disabled={disabled} state={state} />
        <TextAlignButtons actions={actions} disabled={disabled} state={state} />
      </div>
      <div
        data-ui="content.design-review.typography-fields"
        className="grid grid-cols-1 gap-x-2 gap-y-1"
      >
        <div className="col-span-1">
          <ColorField
            disabled={disabled}
            label={translate('content.designReview.color')}
            {...fieldState(state, actions, 'color')}
            onChange={(value) => change('color', value)}
          />
        </div>
        <TextSelectField
          className="col-span-1"
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
        className="col-span-1"
        disabled={disabled}
        label={translate('content.designReview.letterSpacing')}
        options={getLetterSpacingOptions(fieldState(state, actions, 'letter-spacing').value)}
        {...fieldState(state, actions, 'letter-spacing')}
        onChange={(value) => change('letter-spacing', value)}
      />
    </>
  );
}
